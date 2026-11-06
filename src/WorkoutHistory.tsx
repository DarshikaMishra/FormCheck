import { useState } from "react";
import type { RefObject } from "react";
import type { TrackerControls } from "./PoseOverlay";
import { loadHistory, writeHistory } from "./sessionStorage";
import type { WorkoutSession } from "./sessionStorage";

type Props = {
  trackerRef: RefObject<TrackerControls | null>;
  sourceLabel: string;
  canSave: boolean;
};

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function WorkoutHistory({
  trackerRef,
  sourceLabel,
  canSave,
}: Props) {
  const [history, setHistory] = useState(loadHistory);
  const [notice, setNotice] = useState("");

  function saveSession() {
    const tracker = trackerRef.current;
    if (!tracker) return;

    // Pause before capturing a stable summary.
    tracker.pause();

    const summary = tracker.getSummary();

    if (!summary || summary.reps === 0) {
      setNotice("Complete at least one counted rep before saving.");
      return;
    }

    const session: WorkoutSession = {
      ...summary,
      savedAt: new Date().toISOString(),
      sourceLabel,
    };

    // Re-saving updates this session instead of adding a duplicate.
    const nextSessions = [
      session,
      ...history.sessions.filter((item) => item.id !== session.id),
    ].slice(0, 100);

    try {
      writeHistory(nextSessions);
      setHistory({ sessions: nextSessions, error: "" });
      setNotice("Session saved. Reset the session to begin a new workout.");
    } catch {
      setNotice(
        "Could not save. Browser storage may be blocked or full. Your current count is still available.",
      );
    }
  }

  function deleteSession(id: string) {
    const nextSessions = history.sessions.filter(
      (session) => session.id !== id,
    );

    try {
      writeHistory(nextSessions);
      setHistory({ sessions: nextSessions, error: "" });
      setNotice("Session deleted.");
    } catch {
      setNotice("Could not delete the saved session. Please try again.");
    }
  }

  return (
    <section className="history-section" aria-label="Workout history">
      <div className="history-header">
        <div>
          <h2>Workout history</h2>
          <p>Your latest 100 saved sessions, stored in this browser.</p>
        </div>

        <button className="primary" onClick={saveSession} disabled={!canSave}>
          Save session
        </button>
      </div>

      {(notice || history.error) && (
        <p className="history-notice" role="status">
          {notice || history.error}
        </p>
      )}

      {history.sessions.length === 0 ? (
        <p className="history-empty">
          No saved workouts yet. Count a squat, then save your session.
        </p>
      ) : (
        <ul className="history-list">
          {history.sessions.map((session) => (
            <li key={session.id} className="history-card">
              <div className="history-card-heading">
                <div>
                  <h3>
                    {session.reps} {session.reps === 1 ? "rep" : "reps"}
                  </h3>

                  <time dateTime={session.savedAt}>
                    {new Date(session.savedAt).toLocaleString()}
                  </time>
                </div>

                <button
                  className="secondary"
                  onClick={() => deleteSession(session.id)}
                  aria-label={`Delete session saved ${new Date(
                    session.savedAt,
                  ).toLocaleString()}`}
                >
                  Delete
                </button>
              </div>

              <p className="history-source">{session.sourceLabel}</p>

              <dl className="history-stats">
                <div>
                  <dt>Tracking time</dt>
                  <dd>{formatDuration(session.trackingSeconds)}</dd>
                </div>

                <div>
                  <dt>Last rep min. knee angle</dt>
                  <dd>
                    {session.lastRepMinAngle === null
                      ? "—"
                      : `${Math.round(session.lastRepMinAngle)}°`}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
