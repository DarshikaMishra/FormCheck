export type SquatPhase = "waiting" | "standing" | "lowering" | "rising";

export type SquatSnapshot = {
  reps: number;
  phase: SquatPhase;
  lastRepMinAngle: number | null;
};

const STANDING_ANGLE = 160;
const LOWERING_ANGLE = 145;
const DEPTH_ANGLE = 105;
const RISING_CHANGE = 12;

const MIN_REP_MS = 600;
const MAX_REP_MS = 15_000;
const MAX_FRAME_GAP_MS = 350;

export class SquatCounter {
  private reps = 0;
  private phase: SquatPhase = "waiting";
  private minimumAngle = 180;
  private startedAt: number | null = null;
  private lastTime: number | null = null;
  private lastRepMinAngle: number | null = null;

  snapshot(): SquatSnapshot {
    return {
      reps: this.reps,
      phase: this.phase,
      lastRepMinAngle: this.lastRepMinAngle,
    };
  }

  // Discard an incomplete movement while preserving completed reps.
  interrupt(): SquatSnapshot {
    this.phase = "waiting";
    this.minimumAngle = 180;
    this.startedAt = null;
    this.lastTime = null;

    return this.snapshot();
  }

  reset(): SquatSnapshot {
    this.reps = 0;
    this.lastRepMinAngle = null;
    return this.interrupt();
  }

  update(angle: number, timeMs: number): SquatSnapshot {
    if (
      !Number.isFinite(angle) ||
      !Number.isFinite(timeMs) ||
      angle < 0 ||
      angle > 180
    ) {
      return this.interrupt();
    }

    if (
      this.lastTime !== null &&
      (timeMs <= this.lastTime || timeMs - this.lastTime > MAX_FRAME_GAP_MS)
    ) {
      this.interrupt();
    }

    this.lastTime = timeMs;

    if (this.startedAt !== null && timeMs - this.startedAt > MAX_REP_MS) {
      this.interrupt();
    }

    if (this.phase === "waiting") {
      if (angle >= STANDING_ANGLE) {
        this.phase = "standing";
      }

      return this.snapshot();
    }

    if (this.phase === "standing") {
      if (angle < LOWERING_ANGLE) {
        this.phase = "lowering";
        this.startedAt = timeMs;
        this.minimumAngle = angle;
      }

      return this.snapshot();
    }

    this.minimumAngle = Math.min(this.minimumAngle, angle);

    if (
      this.phase === "lowering" &&
      angle >= this.minimumAngle + RISING_CHANGE
    ) {
      this.phase = "rising";
    }

    if (angle >= STANDING_ANGLE) {
      const duration = timeMs - (this.startedAt ?? timeMs);

      if (this.minimumAngle <= DEPTH_ANGLE && duration >= MIN_REP_MS) {
        this.reps += 1;
        this.lastRepMinAngle = this.minimumAngle;
      }

      this.phase = "standing";
      this.startedAt = null;
      this.minimumAngle = 180;
    }

    return this.snapshot();
  }
}
