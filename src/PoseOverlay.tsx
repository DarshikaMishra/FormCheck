import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { calculateKneeAngle } from "./poseMath";
import { PoseEvaluation } from "./evaluation";
import type { EvaluationData, PoseMetrics } from "./evaluation";
import type { RefObject } from "react";
import { SquatCounter } from "./squatCounter";
import type { SquatSnapshot } from "./squatCounter";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

export type TrackerSummary = {
  id: string;
  reps: number;
  trackingSeconds: number;
  lastRepMinAngle: number | null;
};

export type TrackerControls = {
  start: () => void;
  pause: () => void;
  reset: () => void;
  getSummary: () => TrackerSummary | null;
  getEvaluation: () => EvaluationData | null;
};

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  mirrored: boolean;
  onTrackingChange: (tracking: boolean) => void;
};

type Measurement = {
  angle: number;
  side: "left" | "right";
};

const RUNTIME_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const PoseOverlay = forwardRef<TrackerControls, Props>(function PoseOverlay(
  { videoRef, mirrored, onTrackingChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Loading pose model…");
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [squat, setSquat] = useState<SquatSnapshot>({
    reps: 0,
    phase: "waiting",
    lastRepMinAngle: null,
  });
  const [poseMetrics, setPoseMetrics] = useState<PoseMetrics>({
    updates: 0,
    seconds: 0,
    updatesPerSecond: 0,
    averageInferenceMs: 0,
    framesWithPose: 0,
  });

  const controlsRef = useRef<TrackerControls | null>(null);

  useImperativeHandle(ref, () => ({
    start: () => controlsRef.current?.start(),
    pause: () => controlsRef.current?.pause(),
    reset: () => controlsRef.current?.reset(),
    getSummary: () => controlsRef.current?.getSummary() ?? null,
    getEvaluation: () => controlsRef.current?.getEvaluation() ?? null,
  }));

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let landmarker: PoseLandmarker | null = null;
    let lastVideoTime = -1;
    let smoothedAngle: number | null = null;
    let lastAngleTime = -1;
    let trackedSide: "left" | "right" | null = null;
    const counter = new SquatCounter();
    let tracking = false;
    let evaluation = new PoseEvaluation();
    let lastMetricsRender = 0;
    let sessionId = crypto.randomUUID();
    let trackingStartedAt: number | null = null;
    let trackingMs = 0;

    function resetMeasurement() {
      smoothedAngle = null;
      lastAngleTime = -1;
      trackedSide = null;
      setMeasurement(null);
      setSquat(counter.interrupt());
    }

    function changeTracking(enabled: boolean) {
      const now = performance.now();
      evaluation.pause(now);
      setPoseMetrics(evaluation.metrics(now));

      if (trackingStartedAt !== null) {
        trackingMs += now - trackingStartedAt;
      }

      trackingStartedAt = enabled ? now : null;
      tracking = enabled;

      resetMeasurement();
      onTrackingChange(enabled);
    }

    function resetCurrentSession() {
      changeTracking(false);
      setSquat(counter.reset());

      sessionId = crypto.randomUUID();
      trackingStartedAt = null;
      trackingMs = 0;
      evaluation = new PoseEvaluation();
      lastMetricsRender = 0;
      setPoseMetrics(evaluation.metrics(performance.now()));
    }

    controlsRef.current = {
      start() {
        changeTracking(true);
      },

      pause() {
        changeTracking(false);
      },

      reset() {
        resetCurrentSession();
      },

      getSummary() {
        const snapshot = counter.snapshot();

        const currentTrackingMs =
          trackingStartedAt === null
            ? 0
            : performance.now() - trackingStartedAt;

        return {
          id: sessionId,
          reps: snapshot.reps,
          trackingSeconds: (trackingMs + currentTrackingMs) / 1000,
          lastRepMinAngle: snapshot.lastRepMinAngle,
        };
      },
      getEvaluation() {
        return evaluation.report(performance.now());
      },
    };

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
      const canProcess =
        video.readyState >= 2 &&
        !video.paused &&
        !video.ended &&
        !video.seeking;

      const now = performance.now();

      if (tracking && canProcess) {
        evaluation.resume(now);
      } else {
        evaluation.pause(now);
      }

      if (canProcess && video.currentTime !== lastVideoTime) {
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
          const inferenceStarted = performance.now();

          const result = landmarker.detectForVideo(video, inferenceStarted);

          const inferenceEnded = performance.now();

          if (tracking) {
            evaluation.recordFrame(
              inferenceEnded - inferenceStarted,
              result.landmarks.length > 0,
            );
          }

          if (inferenceEnded - lastMetricsRender >= 1000) {
            setPoseMetrics(evaluation.metrics(inferenceEnded));
            lastMetricsRender = inferenceEnded;
          }

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
                  counter.interrupt();
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
                if (tracking) {
                  const previousReps = counter.snapshot().reps;
                  const next = counter.update(smoothedAngle, time);

                  if (next.reps > previousReps) {
                    evaluation.recordRep({
                      rep: next.reps,
                      videoTimeSeconds: video.currentTime,
                      minimumKneeAngle: next.lastRepMinAngle,
                    });
                  }

                  setSquat(next);
                }

                setStatus("Tracking knee angle");
              }
            }
          }
        } catch (error) {
          console.error("Pose detection failed:", error);
          evaluation.pause(performance.now());
          setPoseMetrics(evaluation.metrics(performance.now()));
          resetMeasurement();
          context.clearRect(0, 0, canvas.width, canvas.height);
          setStatus("Detection failed. Stop and reopen the video source.");
          return;
        }
      }

      frameId = requestAnimationFrame(processFrame);
    }

    const video = videoRef.current;

    function handlePause() {
      changeTracking(false);
    }

    function handleSessionReset() {
      resetCurrentSession();

      const canvas = canvasRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }

    video?.addEventListener("pause", handlePause);
    video?.addEventListener("seeking", handleSessionReset);
    video?.addEventListener("loadstart", handleSessionReset);

    void initialize();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      video?.removeEventListener("pause", handlePause);
      video?.removeEventListener("seeking", handleSessionReset);
      video?.removeEventListener("loadstart", handleSessionReset);
      landmarker?.close();
      landmarker = null;
      controlsRef.current = null;
    };
  }, [videoRef, onTrackingChange]);

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
      <div className="performance-panel">
        {poseMetrics.updates > 0 ? (
          <>
            <strong>{poseMetrics.updatesPerSecond.toFixed(1)}</strong>
            {" pose updates/sec · "}
            {poseMetrics.averageInferenceMs.toFixed(1)}
            {" ms/detection"}
          </>
        ) : (
          "Start tracking to measure pose-update speed"
        )}
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
      <div className="rep-panel">
        <span className="angle-label">Completed reps</span>

        <strong>{squat.reps}</strong>

        <span className="rep-phase">
          {squat.phase === "waiting"
            ? "Stand tall to begin"
            : squat.phase === "standing"
              ? "Standing"
              : squat.phase === "lowering"
                ? "Lowering"
                : "Rising"}
        </span>

        <span className="angle-detail">
          {squat.lastRepMinAngle !== null
            ? `Last rep min. knee angle: ${Math.round(squat.lastRepMinAngle)}°`
            : "Waiting for a complete squat"}
        </span>
      </div>
    </>
  );
});

export default PoseOverlay;
