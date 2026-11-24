import { Graphics, type Rectangle } from "pixi.js";
import { hexToNum } from "@/pixi/colorUtils";
import { animationsEnabled } from "@/pixi/effects/enabled";
import type { GameThemeColors } from "@/themes/gameTheme";
import { SUMMONING_SICKNESS_RIPPLE } from "../cardDisplay.constants";

export class SummoningSicknessRipple extends Graphics {
  private active = false;
  private color = 0;
  private cx = 0;
  private cy = 0;
  private rx = 0;
  private ry = 0;
  private ringWidth = 1;

  constructor() {
    super();
    this.eventMode = "none";
    this.blendMode = "add";
    this.visible = false;
  }

  get isActive(): boolean {
    return this.active;
  }

  configure(active: boolean, area: Rectangle, theme: GameThemeColors): void {
    this.active = active;
    this.visible = active;
    this.color = hexToNum(theme.cardStatus.summoningSick);
    this.cx = area.x + area.width / 2;
    this.cy = area.y + area.height / 2;
    this.rx = area.width * (0.5 - SUMMONING_SICKNESS_RIPPLE.insetXFrac);
    this.ry = area.height * (0.5 - SUMMONING_SICKNESS_RIPPLE.insetYFrac);
    this.ringWidth = Math.max(0.75, area.width * SUMMONING_SICKNESS_RIPPLE.ringWidthFrac);
    if (active) this.drawAt(SUMMONING_SICKNESS_RIPPLE.staticPhase);
    else this.clear();
  }

  tick(now: number): void {
    if (!this.active || !animationsEnabled()) return;
    this.drawAt((now % SUMMONING_SICKNESS_RIPPLE.periodMs) / SUMMONING_SICKNESS_RIPPLE.periodMs);
  }

  private drawAt(phase: number): void {
    const { rings, coreAlpha, ringAlpha } = SUMMONING_SICKNESS_RIPPLE;
    const breathe = 1 + 0.03 * Math.sin(phase * Math.PI * 2);
    this.clear();
    this.ellipse(this.cx, this.cy, this.rx * breathe, this.ry * breathe).fill({
      color: this.color,
      alpha: coreAlpha,
    });
    for (let ring = 0; ring < rings; ring++) {
      const progress = (phase + ring / rings) % 1;
      const scale = 0.2 + 0.8 * progress;
      this.ellipse(this.cx, this.cy, this.rx * scale, this.ry * scale).stroke({
        color: this.color,
        width: this.ringWidth,
        alpha: ringAlpha * (1 - progress),
      });
    }
    this.ellipse(this.cx, this.cy, this.rx, this.ry).stroke({
      color: this.color,
      width: this.ringWidth,
      alpha: ringAlpha * 0.8,
    });
  }
}
