import {
  ART_CROP_WIDTH_STEPS,
  HAND_CARD_WIDTH_STEPS,
  SHORT_LANDSCAPE_CARD_SCALE,
} from "./cardDisplay.constants";

export function artCropTargetWidth(viewportWidth: number, viewportHeight: number): number {
  const step =
    ART_CROP_WIDTH_STEPS.find((candidate) => viewportWidth >= candidate.minViewportWidth) ??
    ART_CROP_WIDTH_STEPS[ART_CROP_WIDTH_STEPS.length - 1];
  const fluid = ((step.vw * viewportWidth) / 100 + (step.vh * viewportHeight) / 100) / 2;
  return Math.min(step.max, Math.max(step.min, fluid));
}

export function handCardTargetWidth(viewportWidth: number, viewportHeight: number): number {
  const step =
    HAND_CARD_WIDTH_STEPS.find((candidate) => viewportWidth >= candidate.minViewportWidth) ??
    HAND_CARD_WIDTH_STEPS[HAND_CARD_WIDTH_STEPS.length - 1];
  const fluid = ((step.vw * viewportWidth) / 100 + (step.vh * viewportHeight) / 100) / 2;
  const shortLandscape =
    viewportHeight <= SHORT_LANDSCAPE_CARD_SCALE.maxViewportHeight &&
    viewportWidth >= viewportHeight * SHORT_LANDSCAPE_CARD_SCALE.minAspect;
  const viewportScale = shortLandscape ? SHORT_LANDSCAPE_CARD_SCALE.scale : 1;
  return Math.min(step.max, Math.max(step.min, fluid)) * step.handScale * viewportScale;
}
