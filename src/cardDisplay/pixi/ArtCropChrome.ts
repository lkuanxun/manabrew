import {
  Container,
  FillGradient,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";
import { CARD_RADIUS } from "@/components/game/game.constants";
import { hexToNum } from "@/pixi/colorUtils";
import { applyManaSymbol } from "@/pixi/manaSymbols";
import { readableTextColor, withAlpha, type GameThemeColors } from "@/themes/gameTheme";
import { UI_FONT_FAMILY } from "@/themes/typography";
import { ART_CROP_FRAME } from "../cardDisplay.constants";
import type { PtDisplay, StatTone } from "../ptDisplay";

export interface ArtCropChromeState {
  name: string;
  frameColors: string[];
  pt: PtDisplay | null;
  tapped: boolean;
}

function statColor(tone: StatTone, theme: GameThemeColors): string {
  if (tone === "buffed") return theme.pt.buffed;
  if (tone === "debuffed") return theme.pt.debuffed;
  if (tone === "lethal") return theme.pt.lethal;
  return theme.cardPaper.ink;
}

function boldText(): Text {
  const text = new Text({
    text: "",
    style: new TextStyle({ fontFamily: UI_FONT_FAMILY, fontWeight: "800", fontSize: 10 }),
  });
  text.resolution = ART_CROP_FRAME.textResolution;
  return text;
}

export class ArtCropChrome {
  readonly back = new Container();
  readonly front = new Container();
  readonly artRect = new Rectangle();
  private readonly frameGfx = new Graphics();
  private readonly nameText = boldText();
  private readonly shadeGfx = new Graphics();
  private readonly ptContainer = new Container();
  private readonly ptGfx = new Graphics();
  private readonly powerText = boldText();
  private readonly slashText = boldText();
  private readonly toughnessText = boldText();
  private readonly washGfx = new Graphics();
  private readonly tapGlyph = new Sprite(Texture.EMPTY);
  private readonly styles = [this.nameText, this.powerText, this.slashText, this.toughnessText].map(
    (text) => text.style,
  );
  private gradients: FillGradient[] = [];
  private width = 0;
  private height = 0;
  private headerHeight = 0;

  constructor() {
    this.back.eventMode = "none";
    this.front.eventMode = "none";
    this.back.addChild(this.frameGfx, this.nameText);
    this.ptContainer.addChild(this.ptGfx, this.powerText, this.slashText, this.toughnessText);
    this.tapGlyph.anchor.set(0.5);
    this.front.addChild(this.shadeGfx, this.washGfx, this.tapGlyph, this.ptContainer);
  }

  get visible(): boolean {
    return this.back.visible;
  }

  set visible(value: boolean) {
    this.back.visible = value;
    this.front.visible = value;
  }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const border = width * ART_CROP_FRAME.borderFrac;
    const inset = width * ART_CROP_FRAME.innerInsetFrac;
    this.headerHeight = height * ART_CROP_FRAME.headerFrac;
    this.artRect.x = border + inset;
    this.artRect.y = border + this.headerHeight;
    this.artRect.width = width - 2 * (border + inset);
    this.artRect.height = height - this.artRect.y - border - inset;
  }

  draw(state: ArtCropChromeState, theme: GameThemeColors): void {
    this.drawFrame(state, theme);
    this.drawShade(theme);
    this.drawPt(state.pt, theme);
    this.drawTapped(state, theme);
  }

  destroy(): void {
    for (const gradient of this.gradients) gradient.destroy();
    this.gradients = [];
    if (!this.back.destroyed) this.back.destroy({ children: true });
    if (!this.front.destroyed) this.front.destroy({ children: true });
    for (const style of this.styles) style.destroy();
  }

  private gradient(
    start: { x: number; y: number },
    end: { x: number; y: number },
    stops: { offset: number; color: string }[],
  ): FillGradient {
    const gradient = new FillGradient({
      type: "linear",
      start,
      end,
      textureSpace: "global",
      colorStops: stops,
    });
    this.gradients.push(gradient);
    return gradient;
  }

  private drawFrame(state: ArtCropChromeState, theme: GameThemeColors): void {
    for (const gradient of this.gradients) gradient.destroy();
    this.gradients = [];
    const { width, height, artRect } = this;
    const border = width * ART_CROP_FRAME.borderFrac;
    const colors = state.frameColors;
    const frameFill =
      colors.length === 1
        ? hexToNum(colors[0]!)
        : this.gradient(
            { x: border, y: 0 },
            { x: width - border, y: 0 },
            colors.map((color, index) => ({ offset: index / (colors.length - 1), color })),
          );
    const radius = CARD_RADIUS;
    const innerRadius = Math.max(0, radius - border / 2);
    this.frameGfx.clear();
    this.frameGfx.roundRect(0, 0, width, height, radius).fill(hexToNum(theme.canvas.shadow));
    this.frameGfx
      .roundRect(border, border, width - 2 * border, height - 2 * border, innerRadius)
      .fill(frameFill);
    this.frameGfx.rect(border, border, width - 2 * border, this.headerHeight).fill(
      this.gradient({ x: 0, y: border }, { x: 0, y: border + this.headerHeight }, [
        {
          offset: 0,
          color: withAlpha(theme.cardPaper.background, ART_CROP_FRAME.headerHighlightAlpha),
        },
        { offset: 1, color: withAlpha(theme.cardPaper.background, 0) },
      ]),
    );
    this.frameGfx
      .rect(border, border + this.headerHeight - 0.5, width - 2 * border, 0.5)
      .fill({ color: hexToNum(theme.canvas.shadow), alpha: 0.4 });
    this.frameGfx
      .roundRect(artRect.x - 0.5, artRect.y - 0.5, artRect.width + 1, artRect.height + 1, 1.5)
      .fill(hexToNum(theme.canvas.shadow));
    const primary = colors.length === 1 ? colors[0]! : theme.cardPaper.background;
    const nameColor = readableTextColor(primary, theme.cardPaper.ink, theme.textOnTinted);
    this.nameText.text = state.name;
    this.nameText.style.fill = nameColor;
    this.nameText.style.fontSize = this.headerHeight * ART_CROP_FRAME.nameFrac;
    const maxNameWidth = width - 2 * border - 4;
    this.nameText.scale.set(1);
    if (this.nameText.width > maxNameWidth)
      this.nameText.scale.x = maxNameWidth / this.nameText.width;
    this.nameText.anchor.set(0, 0.5);
    this.nameText.position.set(border + 2, border + this.headerHeight / 2);
  }

  private drawShade(theme: GameThemeColors): void {
    const { artRect } = this;
    const top = artRect.y + artRect.height * (1 - ART_CROP_FRAME.shadeFrac);
    this.shadeGfx.clear();
    this.shadeGfx.rect(artRect.x, top, artRect.width, artRect.bottom - top).fill(
      this.gradient({ x: 0, y: top }, { x: 0, y: artRect.bottom }, [
        { offset: 0, color: withAlpha(theme.canvas.shadow, 0) },
        { offset: 1, color: withAlpha(theme.canvas.shadow, ART_CROP_FRAME.shadeAlpha) },
      ]),
    );
  }

  private drawPt(pt: PtDisplay | null, theme: GameThemeColors): void {
    this.ptContainer.visible = pt !== null;
    if (!pt) return;
    const boxHeight = this.height * ART_CROP_FRAME.ptHeightFrac;
    const fontSize = boxHeight * 0.72;
    const texts: [Text, string, string][] = [
      [this.powerText, pt.power, statColor(pt.powerTone, theme)],
      [this.slashText, "/", theme.cardPaper.mutedInk],
      [this.toughnessText, pt.toughness, statColor(pt.toughnessTone, theme)],
    ];
    let textWidth = 0;
    for (const [text, value, color] of texts) {
      text.text = value;
      text.style.fill = color;
      text.style.fontSize = text === this.slashText ? fontSize * 0.88 : fontSize;
      text.anchor.set(0, 0.5);
      textWidth += text.width;
    }
    const bevel = boxHeight * ART_CROP_FRAME.ptBevelFrac;
    const boxWidth = Math.max(
      this.width * ART_CROP_FRAME.ptMinWidthFrac,
      textWidth + boxHeight * 0.6,
    );
    const overhang = this.width * ART_CROP_FRAME.ptOverhangFrac;
    const x = this.width - boxWidth + overhang;
    const y = this.height - boxHeight + overhang;
    const radius = boxHeight * 0.32;
    this.ptGfx.clear();
    this.ptGfx
      .roundRect(x, y, boxWidth, boxHeight, radius)
      .fill(hexToNum(theme.cardPaper.border))
      .stroke({ color: hexToNum(theme.canvas.shadow), width: 1, alignment: 1 });
    this.ptGfx
      .roundRect(
        x + bevel,
        y + bevel,
        boxWidth - 2 * bevel,
        boxHeight - 2 * bevel,
        radius - bevel / 2,
      )
      .fill(hexToNum(theme.cardPaper.background));
    let cursor = x + (boxWidth - textWidth) / 2;
    for (const [text] of texts) {
      text.position.set(cursor, y + boxHeight / 2);
      cursor += text.width;
    }
  }

  private drawTapped(state: ArtCropChromeState, theme: GameThemeColors): void {
    this.washGfx.visible = state.tapped;
    this.tapGlyph.visible = state.tapped;
    if (!state.tapped) return;
    this.washGfx.clear();
    this.washGfx
      .roundRect(0, 0, this.width, this.height, CARD_RADIUS)
      .fill({ color: hexToNum(theme.textOnTinted), alpha: ART_CROP_FRAME.tapWashAlpha });
    const size = this.width * ART_CROP_FRAME.tapGlyphFrac;
    applyManaSymbol(this.tapGlyph, "T", size);
    this.tapGlyph.alpha = 0.9;
    this.tapGlyph.position.set(this.width / 2, this.height / 2);
  }
}
