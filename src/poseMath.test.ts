import { describe, expect, it } from "vitest";
import { calculateKneeAngle } from "./poseMath";

describe("calculateKneeAngle", () => {
  it("measures a straight leg as 180 degrees", () => {
    const angle = calculateKneeAngle(
      { x: 0.5, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.8 },
      1280,
      720,
    );

    expect(angle).toBeCloseTo(180);
  });

  it("measures a right-angle bend as 90 degrees", () => {
    const angle = calculateKneeAngle(
      { x: 0.5, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.8, y: 0.5 },
      1280,
      720,
    );

    expect(angle).toBeCloseTo(90);
  });

  it("accounts for a rectangular video's aspect ratio", () => {
    const angle = calculateKneeAngle(
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0.5 },
      1280,
      720,
    );

    // In pixels, the vectors are (-320, -180) and (320, 0).
    expect(angle).toBeCloseTo(150.642, 2);
  });

  it("returns null when two required joints overlap", () => {
    const angle = calculateKneeAngle(
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.8, y: 0.8 },
      1280,
      720,
    );

    expect(angle).toBeNull();
  });
});
