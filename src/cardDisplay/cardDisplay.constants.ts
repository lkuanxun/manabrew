export const ART_CROP_ASPECT = 0.75;

export const ART_CROP_TAP_ANGLE = (17 * Math.PI) / 180;
export const ART_CROP_TAPPED_ALPHA = 0.85;

export const ART_CROP_FRAME = {
  borderFrac: 0.04,
  innerInsetFrac: 0.025,
  headerFrac: 0.2,
  nameFrac: 0.62,
  headerHighlightAlpha: 0.35,
  shadeFrac: 0.3,
  shadeAlpha: 0.5,
  ptHeightFrac: 0.24,
  ptMinWidthFrac: 0.4,
  ptOverhangFrac: 0.04,
  ptBevelFrac: 0.12,
  tapWashAlpha: 0.2,
  tapGlyphFrac: 0.42,
  textResolution: 4,
} as const;

export const SUMMONING_SICKNESS_RIPPLE = {
  insetXFrac: 0.1,
  insetYFrac: 0.08,
  rings: 4,
  periodMs: 3400,
  coreAlpha: 0.34,
  ringAlpha: 0.42,
  ringWidthFrac: 0.025,
  staticPhase: 0.35,
} as const;

export const ART_CROP_WIDTH_STEPS = [
  { minViewportWidth: 1200, vw: 8.2, vh: 15.5, min: 104, max: 160 },
  { minViewportWidth: 768, vw: 8.8, vh: 15, min: 100, max: 156 },
  { minViewportWidth: 0, vw: 10, vh: 14, min: 96, max: 152 },
] as const;

export const HAND_FAN = {
  hoverScale: 1.8,
  hoverLiftPx: 70,
  restingSinkFrac: 48 / 227,
  arcReferenceWidth: 162,
} as const;

export const HAND_CARD_WIDTH_STEPS = [
  { minViewportWidth: 1200, vw: 5.9, vh: 12, min: 72, max: 116, handScale: 1.4 },
  { minViewportWidth: 768, vw: 6.4, vh: 11.5, min: 68, max: 112, handScale: 1.4 },
  { minViewportWidth: 640, vw: 7, vh: 11, min: 64, max: 108, handScale: 1.34 },
  { minViewportWidth: 0, vw: 7, vh: 11, min: 64, max: 108, handScale: 1.14 },
] as const;

export const SHORT_LANDSCAPE_CARD_SCALE = { maxViewportHeight: 820, minAspect: 1.1, scale: 0.95 };
