import { HAND_FAN } from "./cardDisplay.constants";

export type HandFanProfile = "compact" | "wide";

export interface HandFanSlot {
  x: number;
  drop: number;
  rot: number;
}

function overlapFraction(count: number, profile: HandFanProfile): number {
  if (profile === "wide") {
    if (count <= 3) return -0.1;
    if (count <= 5) return -0.15;
    if (count <= 7) return -0.25;
    return Math.max(-0.86, Math.min(-0.35, 4.5 / (count - 1) - 1));
  }
  if (count <= 5) return -0.25;
  if (count <= 7) return -0.45;
  return Math.max(-0.85, Math.min(-0.6, 3 / (count - 1) - 1));
}

function arcCoefficient(count: number, profile: HandFanProfile): number {
  const maxDistance = (count - 1) / 2;
  if (profile === "wide") return count <= 7 ? 3.5 : 32 / (maxDistance * maxDistance);
  return count <= 7 ? 6 : 54 / (maxDistance * maxDistance);
}

export function handFanSlots(
  count: number,
  cardW: number,
  maxWidth: number,
  profile: HandFanProfile = "wide",
): HandFanSlot[] {
  if (count === 0) return [];
  const center = (count - 1) / 2;
  const shape = Math.max(2, count);
  const delta = profile === "wide" ? Math.min(4, 24 / (shape - 1)) : Math.min(6, 36 / (shape - 1));
  const arcCoeff = arcCoefficient(shape, profile);
  const edgeLift = center * center * arcCoeff;
  const arcScale = cardW / HAND_FAN.arcReferenceWidth;
  const naturalStep = cardW * (1 + overlapFraction(count, profile));
  const step = count > 1 ? Math.max(0, Math.min(naturalStep, (maxWidth - cardW) / (count - 1))) : 0;
  return Array.from({ length: count }, (_, k) => {
    const distance = k - center;
    return {
      x: distance * step,
      drop: Math.min(distance * distance * arcCoeff, edgeLift) * arcScale,
      rot: distance * delta,
    };
  });
}
