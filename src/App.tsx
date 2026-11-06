import { useEffect, useRef, useState } from "react";
import "./App.css";
import PoseOverlay from "./PoseOverlay";
import WorkoutHistory from "./WorkoutHistory";
import type { TrackerControls } from "./PoseOverlay";

type Source = "none" | "camera" | "upload";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  const [source, setSource] = useState<Source>("none");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [cameraLoading, setCameraLoading] = useState(false);

  const trackerRef = useRef<TrackerControls | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  // Release browser resources when this component is removed.
  useEffect(() => {
    return () => {
      requestRef.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function releaseSource() {
    // Invalidate any camera request that is still waiting for permission.
    trackerRef.current?.reset();
    setIsTracking(false);
    requestRef.current += 1;

    const video = videoRef.current;

    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setSource("none");
    setFileName("");
    setCameraLoading(false);
  }

  async function startCamera() {
    releaseSource();
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access requires localhost or an HTTPS connection.");
      return;
    }

    const requestId = requestRef.current;
    setCameraLoading(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      // The user may have stopped or switched sources while permission opened.
      if (requestId !== requestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        releaseSource();
        return;
      }

      video.srcObject = stream;
      setSource("camera");

      await video.play();
    } catch (err) {
      if (requestId !== requestRef.current) return;

      releaseSource();

      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Camera permission was denied. Allow access and try again.");
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setError("No camera was found. Try uploading a video instead.");
      } else {
        setError(
          "Could not start the camera. Check whether another app is using it.",
        );
      }
    } finally {
      if (requestId === requestRef.current) {
        setCameraLoading(false);
      }
    }
  }

  function uploadVideo(file?: File) {
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setError("Please choose a video file, such as an MP4.");
      return;
    }

    releaseSource();
    setError("");

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    if (videoRef.current) {
      videoRef.current.src = url;
      videoRef.current.load();
    }

    setFileName(file.name);
    setSource("upload");
  }

  function stopVideo() {
    releaseSource();
    setError("");
  }

  async function startTracking() {
    const video = videoRef.current;
    if (!video || source === "none") return;

    setError("");

    try {
      // Resume playback if the uploaded video was paused.
      await video.play();
      trackerRef.current?.start();
    } catch {
      setError("Could not play the video. Try its play button first.");
    }
  }

  function pauseTracking() {
    trackerRef.current?.pause();
  }

  function resetSession() {
    trackerRef.current?.reset();
  }

  return (
    <main className="app">
      <header className="header">
        <span className="eyebrow">BROWSER-BASED MOVEMENT TRACKING</span>
        <h1>
          FormCheck<span>.</span>
        </h1>
        <p>Track your squats using your camera or a recorded video.</p>
      </header>

      <section className="workspace" aria-label="Video workspace">
        <div className="toolbar">
          <div>
            <h2>Movement studio</h2>
            <p>
              {source === "camera"
                ? "Camera connected"
                : source === "upload"
                  ? fileName
                  : "Choose a video source to begin"}
            </p>
          </div>

          <span className={`badge ${source !== "none" ? "active" : ""}`}>
            {source === "none" ? "No source" : "Source ready"}
          </span>
        </div>

        <div className="video-container">
          <video
            ref={videoRef}
            className={source === "camera" ? "mirrored" : ""}
            playsInline
            muted
            controls={source === "upload"}
            onError={() => {
              setError(
                "This video could not be played. Try an MP4 encoded with H.264.",
              );
            }}
          />
          {source !== "none" && (
            <PoseOverlay
              key={source}
              ref={trackerRef}
              videoRef={videoRef}
              mirrored={source === "camera"}
              onTrackingChange={setIsTracking}
            />
          )}

          {source === "none" && (
            <div className="placeholder">
              <span className="placeholder-icon">◎</span>
              <h3>Your movement, in view.</h3>
              <p>
                Choose your camera or upload a video. Keep the full body visible
                for pose tracking.
              </p>
            </div>
          )}
        </div>

        <div className="actions">
          <button
            className="primary"
            onClick={startCamera}
            disabled={cameraLoading}
          >
            {cameraLoading ? "Opening camera…" : "Use camera"}
          </button>

          <label className="upload-button">
            Upload video
            <input
              type="file"
              accept="video/*"
              onChange={(event) => {
                uploadVideo(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>

          <button
            className="secondary"
            onClick={stopVideo}
            disabled={source === "none" && !cameraLoading}
          >
            Stop
          </button>
        </div>

        {source !== "none" && (
          <div className="session-controls">
            <div className="session-buttons">
              <button
                className="primary"
                onClick={startTracking}
                disabled={isTracking}
              >
                Start tracking
              </button>

              <button
                className="secondary"
                onClick={pauseTracking}
                disabled={!isTracking}
              >
                Pause tracking
              </button>

              <button className="secondary" onClick={resetSession}>
                Reset session
              </button>
            </div>

            <p>
              {isTracking
                ? "Counting active. Begin from standing with your legs visible."
                : "Counting paused. Start tracking when you’re ready."}
            </p>
          </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      <WorkoutHistory
        trackerRef={trackerRef}
        sourceLabel={source === "camera" ? "Webcam" : fileName}
        canSave={source !== "none"}
      />
      <footer>
        Video is processed locally in your browser. Counts and knee angles are
        experimental movement estimates, not a validated form assessment.
      </footer>
    </main>
  );
}
