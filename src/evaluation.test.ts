import { describe, expect, it } from "vitest";
import { PoseEvaluation } from "./evaluation";

describe("PoseEvaluation", () => {
  it("calculates completed pose updates per second", () => {
    const evaluation = new PoseEvaluation();

    evaluation.resume(0);

    for (let i = 0; i < 30; i += 1) {
      evaluation.recordFrame(8, true);
    }

    evaluation.pause(2000);

    expect(evaluation.metrics(2000).updatesPerSecond).toBe(15);
    expect(evaluation.metrics(2000).averageInferenceMs).toBe(8);
  });

  it("excludes paused time", () => {
    const evaluation = new PoseEvaluation();

    evaluation.resume(0);
    evaluation.recordFrame(10, true);
    evaluation.pause(1000);

    evaluation.resume(5000);
    evaluation.recordFrame(10, false);
    evaluation.pause(6000);

    const metrics = evaluation.metrics(9000);

    expect(metrics.seconds).toBe(2);
    expect(metrics.updates).toBe(2);
    expect(metrics.framesWithPose).toBe(1);
    expect(metrics.updatesPerSecond).toBe(1);
  });

  it("records the video timestamp of a detected rep", () => {
    const evaluation = new PoseEvaluation();

    evaluation.recordRep({
      rep: 1,
      videoTimeSeconds: 3.25,
      minimumKneeAngle: 95,
    });

    expect(evaluation.report(0).repEvents).toEqual([
      {
        rep: 1,
        videoTimeSeconds: 3.25,
        minimumKneeAngle: 95,
      },
    ]);
  });
});
