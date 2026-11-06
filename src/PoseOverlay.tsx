import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  mirrored: boolean;
};

const RUNTIME_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export default function PoseOverlay({ videoRef, mirrored }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Loading pose model…");

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let landmarker: PoseLandmarker | null = null;
    let lastVideoTime = -1;

    async function initialize() {
      try {
        const vision = await FilesetResolver.forVisionTasks(RUNTIME_URL);

        if (cancelled) return;

        // Try GPU acceleration first, then fall back to the CPU.
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        } catch {
          if (cancelled) return;

          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        }

        if (cancelled) {
          landmarker.close();
          landmarker = null;
          return;
        }

        setStatus("Model ready — play the video");
        frameId = requestAnimationFrame(processFrame);
      } catch (error) {
        if (cancelled) return;

        console.error("Pose model initialization failed:", error);
        setStatus("Model failed to load. Check your connection and refresh.");
      }
    }

    function processFrame() {
      if (cancelled || !landmarker) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");

      if (!video || !canvas || !context) {
        frameId = requestAnimationFrame(processFrame);
        return;
      }

      // Skip duplicate frames, paused videos, and frames that aren't ready.
      if (
        video.readyState >= 2 &&
        !video.paused &&
        !video.ended &&
        !video.seeking &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime;

        try {
          if (
            canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight
          ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          // MediaPipe requires timestamps that keep increasing,
          // including when the uploaded video is replayed.
          const result = landmarker.detectForVideo(video, performance.now());

          context.clearRect(0, 0, canvas.width, canvas.height);

          const landmarks = result.landmarks[0];

          if (!landmarks) {
            setStatus("No person detected");
          } else {
            const drawing = new DrawingUtils(context);

            // Only draw points that appear visible and inside the image.
            const isVisible = (index: number) => {
              const point = landmarks[index];

              return (
                point !== undefined &&
                (point.visibility ?? 0) >= 0.6 &&
                point.x >= 0 &&
                point.x <= 1 &&
                point.y >= 0 &&
                point.y <= 1
              );
            };

            const connections = PoseLandmarker.POSE_CONNECTIONS.filter(
              ({ start, end }) => isVisible(start) && isVisible(end),
            );

            drawing.drawConnectors(landmarks, connections, {
              color: "#a3e635",
              lineWidth: 3,
            });

            drawing.drawLandmarks(
              landmarks.filter((_, index) => isVisible(index)),
              {
                color: "#ffffff",
                fillColor: "#a3e635",
                radius: 4,
              },
            );

            // Landmark indices:
            // Left hip/knee/ankle: 23, 25, 27
            // Right hip/knee/ankle: 24, 26, 28
            const leftLegVisible = [23, 25, 27].every(isVisible);
            const rightLegVisible = [24, 26, 28].every(isVisible);

            setStatus(
              leftLegVisible || rightLegVisible
                ? "Pose detected — leg landmarks visible"
                : "Pose detected — keep hips, knees, and ankles in view",
            );
          }
        } catch (error) {
          console.error("Pose detection failed:", error);
          context.clearRect(0, 0, canvas.width, canvas.height);
          setStatus("Detection failed. Stop and reopen the video source.");
          return;
        }
      }

      frameId = requestAnimationFrame(processFrame);
    }

    void initialize();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      landmarker?.close();
      landmarker = null;
    };
  }, [videoRef]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`pose-overlay${mirrored ? " mirrored" : ""}`}
        aria-hidden="true"
      />
      <div className="pose-status" role="status">
        {status}
      </div>
    </>
  );
}
