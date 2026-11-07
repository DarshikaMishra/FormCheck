export type RepEvent = {
  rep: number;
  videoTimeSeconds: number;
  minimumKneeAngle: number | null;
};

export type PoseMetrics = {
  updates: number;
  seconds: number;
  updatesPerSecond: number;
  averageInferenceMs: number;
  framesWithPose: number;
};

export type EvaluationData = {
  metrics: PoseMetrics;
  repEvents: RepEvent[];
};

export class PoseEvaluation {
  private updates = 0;
  private framesWithPose = 0;
  private inferenceMs = 0;
  private measuredMs = 0;
  private segmentStart: number | null = null;
  private repEvents: RepEvent[] = [];

  resume(now: number) {
    if (this.segmentStart === null) {
      this.segmentStart = now;
    }
  }

  pause(now: number) {
    if (this.segmentStart !== null) {
      this.measuredMs += Math.max(0, now - this.segmentStart);
      this.segmentStart = null;
    }
  }

  recordFrame(inferenceMs: number, hasPose: boolean) {
    this.updates += 1;
    this.inferenceMs += inferenceMs;

    if (hasPose) {
      this.framesWithPose += 1;
    }
  }

  recordRep(event: RepEvent) {
    this.repEvents.push({ ...event });
  }

  metrics(now: number): PoseMetrics {
    const currentMs =
      this.segmentStart === null ? 0 : Math.max(0, now - this.segmentStart);

    const seconds = (this.measuredMs + currentMs) / 1000;

    return {
      updates: this.updates,
      seconds,
      updatesPerSecond: seconds > 0 ? this.updates / seconds : 0,
      averageInferenceMs:
        this.updates > 0 ? this.inferenceMs / this.updates : 0,
      framesWithPose: this.framesWithPose,
    };
  }

  report(now: number): EvaluationData {
    return {
      metrics: this.metrics(now),
      repEvents: this.repEvents.map((event) => ({ ...event })),
    };
  }
}
