import type { CardDto } from "@/protocol/game";
import { ScryfallImg } from "@/components/ScryfallImg";
import { useTheme } from "@/hooks/useTheme";
import { readableTextColor, withAlpha, type GameThemeColors } from "@/themes/gameTheme";
import { ART_CROP_ASPECT, ART_CROP_FRAME } from "./cardDisplay.constants";
import { artCropFrameColors } from "./frameColors";
import { ptDisplay, type StatTone } from "./ptDisplay";

interface ArtCropCardFaceProps {
  card: CardDto;
  artCrop?: string;
  width?: number;
}

function statColor(tone: StatTone, theme: GameThemeColors): string {
  if (tone === "buffed") return theme.pt.buffed;
  if (tone === "debuffed") return theme.pt.debuffed;
  if (tone === "lethal") return theme.pt.lethal;
  return theme.cardPaper.ink;
}

export function ArtCropCardFace({ card, artCrop, width = 88 }: ArtCropCardFaceProps) {
  const theme = useTheme().gameTheme;
  const height = width * ART_CROP_ASPECT;
  const border = width * ART_CROP_FRAME.borderFrac;
  const inset = width * ART_CROP_FRAME.innerInsetFrac;
  const header = height * ART_CROP_FRAME.headerFrac;
  const colors = artCropFrameColors(card, theme.mana);
  const frame = colors.length === 1 ? colors[0] : `linear-gradient(to right, ${colors.join(", ")})`;
  const nameColor = readableTextColor(
    colors.length === 1 ? colors[0]! : theme.cardPaper.background,
    theme.cardPaper.ink,
    theme.textOnTinted,
  );
  const pt = ptDisplay(card);
  const ptHeight = height * ART_CROP_FRAME.ptHeightFrac;
  const overhang = width * ART_CROP_FRAME.ptOverhangFrac;

  return (
    <div className="relative shrink-0 select-none" style={{ width, height }}>
      <div
        className="absolute inset-0 overflow-hidden rounded-md"
        style={{ background: theme.canvas.shadow, padding: border }}
      >
        <div
          className="relative h-full w-full overflow-hidden rounded-sm"
          style={{ background: frame }}
        >
          <div
            className="absolute inset-x-0 top-0 flex items-center"
            style={{
              height: header,
              paddingInline: 2,
              background: `linear-gradient(to bottom, ${withAlpha(theme.cardPaper.background, ART_CROP_FRAME.headerHighlightAlpha)}, ${withAlpha(theme.cardPaper.background, 0)})`,
              borderBottom: `0.5px solid ${withAlpha(theme.canvas.shadow, 0.4)}`,
            }}
          >
            <span
              className="truncate font-extrabold leading-none"
              style={{ color: nameColor, fontSize: header * ART_CROP_FRAME.nameFrac }}
            >
              {card.identity.name}
            </span>
          </div>
          <div
            className="absolute overflow-hidden rounded-[1.5px]"
            style={{
              left: inset,
              right: inset,
              top: header,
              bottom: inset,
              background: theme.canvas.shadow,
            }}
          >
            {artCrop && (
              <ScryfallImg
                src={artCrop}
                alt={card.identity.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div
              className="absolute inset-x-0 bottom-0"
              style={{
                height: `${ART_CROP_FRAME.shadeFrac * 100}%`,
                background: `linear-gradient(to bottom, ${withAlpha(theme.canvas.shadow, 0)}, ${withAlpha(theme.canvas.shadow, ART_CROP_FRAME.shadeAlpha)})`,
              }}
            />
          </div>
        </div>
      </div>
      {pt && (
        <div
          className="absolute flex items-center justify-center rounded-md font-extrabold leading-none"
          style={{
            right: -overhang,
            bottom: -overhang,
            height: ptHeight,
            minWidth: width * ART_CROP_FRAME.ptMinWidthFrac,
            paddingInline: ptHeight * 0.3,
            fontSize: ptHeight * 0.72,
            background: theme.cardPaper.background,
            border: `${ptHeight * ART_CROP_FRAME.ptBevelFrac}px solid ${theme.cardPaper.border}`,
            outline: `1px solid ${theme.canvas.shadow}`,
          }}
        >
          <span style={{ color: statColor(pt.powerTone, theme) }}>{pt.power}</span>
          <span style={{ color: theme.cardPaper.mutedInk }}>/</span>
          <span style={{ color: statColor(pt.toughnessTone, theme) }}>{pt.toughness}</span>
        </div>
      )}
    </div>
  );
}
