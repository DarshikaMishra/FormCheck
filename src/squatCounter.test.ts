import { describe, expect, it } from "vitest";
import { SquatCounter } from "./squatCounter";

// Simulate successive video measurements, 200 ms apart.
function feed(
  counter: SquatCounter,
  angles: number[],
  start = 0,
  interval = 200,
) {
  angles.forEach((angle, index) => {
    counter.update(angle, start + index * interval);
  });

  return counter.snapshot();
}

const completeSquat = [170, 150, 140, 120, 95, 110, 140, 165];

describe("SquatCounter", () => {
  it("counts complete squats once each", () => {
    const counter = new SquatCounter();

    feed(counter, completeSquat);
    expect(counter.snapshot().reps).toBe(1);

    feed(counter, completeSquat, 1600);
    expect(counter.snapshot().reps).toBe(2);
    expect(counter.snapshot().lastRepMinAngle).toBe(95);
  });

  it("does not count a video that starts halfway through a squat", () => {
    const counter = new SquatCounter();

    feed(counter, [95, 110, 140, 165]);

    expect(counter.snapshot().reps).toBe(0);
    expect(counter.snapshot().phase).toBe("standing");
  });

  it("does not count movements that miss the depth threshold", () => {
    const counter = new SquatCounter();

    feed(counter, [170, 150, 140, 125, 115, 130, 150, 165]);

    expect(counter.snapshot().reps).toBe(0);
  });

  it("does not count small standing-angle fluctuations", () => {
    const counter = new SquatCounter();

    feed(counter, [170, 165, 158, 162, 155, 163, 170]);

    expect(counter.snapshot().reps).toBe(0);
  });

  it("discards an interrupted movement but keeps completed reps", () => {
    const counter = new SquatCounter();

    feed(counter, completeSquat);
    feed(counter, [170, 140, 95], 1600);

    counter.interrupt();

    // Returning upright after tracking loss must not finish the old rep.
    feed(counter, [110, 140, 165], 2200);

    expect(counter.snapshot().reps).toBe(1);
  });

  it("discards an incomplete rep after a long measurement gap", () => {
    const counter = new SquatCounter();

    feed(counter, [170, 140, 95]);
    feed(counter, [110, 140, 165], 2000);

    expect(counter.snapshot().reps).toBe(0);
  });

  it("rejects an implausibly fast angle sequence", () => {
    const counter = new SquatCounter();

    feed(counter, completeSquat, 0, 50);

    expect(counter.snapshot().reps).toBe(0);
  });

  it("clears the session when reset", () => {
    const counter = new SquatCounter();

    feed(counter, completeSquat);
    counter.reset();

    expect(counter.snapshot()).toEqual({
      reps: 0,
      phase: "waiting",
      lastRepMinAngle: null,
    });
  });
});
