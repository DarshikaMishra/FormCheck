import { useEffect, useRef, useState } from "react";
import { calculateKneeAngle } from "./poseMath";
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

type Measurement = {
  angle: number;
  side: "left" | "right";
};

const RUNTIME_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export default function PoseOverlay({ videoRef, mirrored }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Loading pose model…");
  const [measurement, setMeasurement] = useState<Measurement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let landmarker: PoseLandmarker | null = null;
    let lastVideoTime = -1;
    let smoothedAngle: number | null = null;
    let lastAngleTime = -1;
    let trackedSide: "left" | "right" | null = null;

    function resetMeasurement() {
      smoothedAngle = null;
      lastAngleTime = -1;
      trackedSide = null;
      setMeasurement(null);
    }

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
            resetMeasurement();
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

            if (!leftLegVisible && !rightLegVisible) {
              resetMeasurement();
              setStatus("Pose detected — keep hips, knees, and ankles in view");
            } else {
              // Keep using the same leg while it remains visible.
              // This avoids jumping between left and right measurements.
              let side: "left" | "right";

              if (trackedSide === "left" && leftLegVisible) {
                side = "left";
              } else if (trackedSide === "right" && rightLegVisible) {
                side = "right";
              } else {
                side = leftLegVisible ? "left" : "right";
              }

              const [hipIndex, kneeIndex, ankleIndex] =
                side === "left" ? [23, 25, 27] : [24, 26, 28];

              const rawAngle = calculateKneeAngle(
                landmarks[hipIndex],
                landmarks[kneeIndex],
                landmarks[ankleIndex],
                video.videoWidth,
                video.videoHeight,
              );

              if (rawAngle === null) {
                resetMeasurement();
                setStatus("Could not measure knee angle");
              } else {
                const time = video.currentTime * 1000;
                const elapsed = time - lastAngleTime;

                // Start fresh after tracking loss, a leg switch,
                // replay, seeking, or a long gap between frames.
                if (
                  smoothedAngle === null ||
                  trackedSide !== side ||
                  elapsed <= 0 ||
                  elapsed > 300
                ) {
                  smoothedAngle = rawAngle;
                } else {
                  // Blend the new angle with the previous estimate.
                  // A 120 ms time constant reduces jitter with a small delay.
                  const alpha = 1 - Math.exp(-elapsed / 120);
                  smoothedAngle += alpha * (rawAngle - smoothedAngle);
                }

                trackedSide = side;
                lastAngleTime = time;

                setMeasurement({
                  angle: smoothedAngle,
                  side,
                });

                setStatus("Tracking knee angle");
              }
            }
          }
        } catch (error) {
          console.error("Pose detection failed:", error);
          resetMeasurement();
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
      <div className="angle-panel">
        <span className="angle-label">Knee angle · video estimate</span>

        <strong>
          {measurement ? `${Math.round(measurement.angle)}°` : "—"}
        </strong>

        <span className="angle-detail">
          {measurement
            ? `${measurement.side === "left" ? "Left" : "Right"} leg tracked`
            : "Waiting for visible leg landmarks"}
        </span>
      </div>
    </>
  );
}
