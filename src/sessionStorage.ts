export type WorkoutSession = {
  id: string;
  savedAt: string;
  sourceLabel: string;
  reps: number;
  trackingSeconds: number;
  lastRepMinAngle: number | null;
};

type HistoryResult = {
  sessions: WorkoutSession[];
  error: string;
};

const STORAGE_KEY = "formcheck.sessions.v1";
const MAX_SESSIONS = 100;

function isWorkoutSession(value: unknown): value is WorkoutSession {
  if (typeof value !== "object" || value === null) return false;

  const session = value as Partial<WorkoutSession>;

  return (
    typeof session.id === "string" &&
    typeof session.savedAt === "string" &&
    Number.isFinite(Date.parse(session.savedAt)) &&
    typeof session.sourceLabel === "string" &&
    typeof session.reps === "number" &&
    Number.isInteger(session.reps) &&
    session.reps > 0 &&
    typeof session.trackingSeconds === "number" &&
    Number.isFinite(session.trackingSeconds) &&
    session.trackingSeconds >= 0 &&
    (session.lastRepMinAngle === null ||
      (typeof session.lastRepMinAngle === "number" &&
        Number.isFinite(session.lastRepMinAngle) &&
        session.lastRepMinAngle >= 0 &&
        session.lastRepMinAngle <= 180))
  );
}

export function loadHistory(): HistoryResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      return { sessions: [], error: "" };
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed) || !parsed.every(isWorkoutSession)) {
      throw new Error("Invalid saved history");
    }

    return {
      sessions: parsed.slice(0, MAX_SESSIONS),
      error: "",
    };
  } catch {
    return {
      sessions: [],
      error: "Saved history could not be loaded from this browser.",
    };
  }
}

export function writeHistory(sessions: WorkoutSession[]): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sessions.slice(0, MAX_SESSIONS)),
  );
}
