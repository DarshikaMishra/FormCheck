type Point = {
  x: number;
  y: number;
};

export function calculateKneeAngle(
  hip: Point,
  knee: Point,
  ankle: Point,
  videoWidth: number,
  videoHeight: number,
): number | null {
  // Convert normalized coordinates into pixels so the video's
  // aspect ratio doesn't distort the angle.
  const hipX = (hip.x - knee.x) * videoWidth;
  const hipY = (hip.y - knee.y) * videoHeight;
  const ankleX = (ankle.x - knee.x) * videoWidth;
  const ankleY = (ankle.y - knee.y) * videoHeight;

  const hipLength = Math.hypot(hipX, hipY);
  const ankleLength = Math.hypot(ankleX, ankleY);

  if (hipLength < 1 || ankleLength < 1) return null;

  const cosine = (hipX * ankleX + hipY * ankleY) / (hipLength * ankleLength);

  // Floating-point rounding can put the value slightly outside [-1, 1].
  const clampedCosine = Math.max(-1, Math.min(1, cosine));

  return (Math.acos(clampedCosine) * 180) / Math.PI;
}
