import { HAND_FAN, handFanSlots } from "@/cardDisplay";

export const HOVER_SCALE = HAND_FAN.hoverScale;

export const HAND_FAN_PARAMS = {
  hoverLift: HAND_FAN.hoverLiftPx,
  neighborPush: 0,
  maxSpread: 90,
  minSpread: 38,
  spreadWidth: 1800,
} as const;
export const COMPACT_HAND_FAN_PARAMS = {
  hoverLift: 82,
  neighborPush: 88,
  maxSpread: 104,
  minSpread: 48,
  spreadWidth: 1080,
} as const;

export interface BaseCardLayout {
  x: number;
  drop: number;
  rot: number;
}

export interface HandCardLayout {
  x: number;
  y: number;
  rotation: number;
  scaleW: number;
  scaleH: number;
}

export function computeBaseLayout(
  count: number,
  cardW: number,
  maxSpread: number,
  minSpread: number,
  spreadWidth: number,
  arc = true,
): BaseCardLayout[] {
  if (count === 0) return [];
  if (arc) return handFanSlots(count, cardW, spreadWidth);
  if (count === 1) return [{ x: 0, drop: 0, rot: 0 }];

  const spread = Math.max(
    minSpread,
    Math.min(maxSpread, Math.floor((spreadWidth - cardW) / (count - 1))),
  );
  const totalWidth = (count - 1) * spread;
  return Array.from({ length: count }, (_, i) => ({
    x: -totalWidth / 2 + i * spread,
    drop: 0,
    rot: 0,
  }));
}

export function computeHandLayout(
  count: number,
  cardW: number,
  cardH: number,
  maxSpread: number,
  minSpread: number,
  spreadWidth: number,
  hoveredIndex: number | null,
  hoverLift: number,
  neighborPush: number,
  arc = true,
): HandCardLayout[] {
  const basePositions = computeBaseLayout(count, cardW, maxSpread, minSpread, spreadWidth, arc);
  if (basePositions.length === 0) return [];

  const hovW = Math.round(cardW * HOVER_SCALE);
  const hovH = Math.round(cardH * HOVER_SCALE);

  return basePositions.map((pos, i) => {
    const isHov = hoveredIndex === i;

    let pushX = 0;
    if (hoveredIndex !== null && hoveredIndex >= 0 && i !== hoveredIndex) {
      const dist = Math.abs(i - hoveredIndex);
      const sign = i < hoveredIndex ? -1 : 1;
      pushX = sign * Math.max(0, neighborPush - dist * 6);
    }

    const curW = isHov ? hovW : cardW;
    const curH = isHov ? hovH : cardH;
    const tx = pos.x + pushX;
    const ty = isHov ? -hoverLift : pos.drop;
    const rot = isHov ? 0 : pos.rot;

    return {
      x: tx,
      y: ty,
      rotation: rot,
      scaleW: curW,
      scaleH: curH,
    };
  });
}
