import type { CardDto } from "@/protocol/game";
import type { GameThemeColors } from "@/themes/gameTheme";

type ColoredManaLetter = "W" | "U" | "B" | "R" | "G";

const COLORED_LETTERS = new Set<string>(["W", "U", "B", "R", "G"]);

const BASIC_LAND_COLOR: Record<string, ColoredManaLetter> = {
  Plains: "W",
  Island: "U",
  Swamp: "B",
  Mountain: "R",
  Forest: "G",
};

function coloredLetters(card: Pick<CardDto, "color" | "types" | "subtypes">): ColoredManaLetter[] {
  const letters = [...(card.color ?? "")].filter((letter): letter is ColoredManaLetter =>
    COLORED_LETTERS.has(letter),
  );
  if (letters.length > 0) return letters;
  if (!card.types?.some((type) => type.toLowerCase() === "land")) return [];
  return (card.subtypes ?? []).flatMap((subtype) =>
    BASIC_LAND_COLOR[subtype] ? [BASIC_LAND_COLOR[subtype]] : [],
  );
}

export function artCropFrameColors(
  card: Pick<CardDto, "color" | "types" | "subtypes">,
  mana: GameThemeColors["mana"],
): string[] {
  const letters = coloredLetters(card);
  return letters.length === 0 ? [mana.C] : letters.map((letter) => mana[letter]);
}
