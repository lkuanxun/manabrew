import type { CardDto } from "@/protocol/game";

export type StatTone = "neutral" | "buffed" | "debuffed" | "lethal";

export interface PtDisplay {
  power: string;
  toughness: string;
  powerTone: StatTone;
  toughnessTone: StatTone;
}

type PtCard = Pick<
  CardDto,
  "types" | "power" | "toughness" | "basePower" | "baseToughness" | "damage"
>;

export function parseStat(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statTone(current: number, base: number | null | undefined): StatTone {
  if (base == null || current === base) return "neutral";
  return current > base ? "buffed" : "debuffed";
}

export function ptTone(card: PtCard): StatTone {
  const toughness = parseStat(card.toughness);
  if (card.damage != null && card.damage >= toughness) return "lethal";
  if (card.basePower == null) return "neutral";
  const power = parseStat(card.power);
  const baseToughness = card.baseToughness ?? 0;
  if (power > card.basePower || toughness > baseToughness) return "buffed";
  if (power < card.basePower || toughness < baseToughness) return "debuffed";
  return "neutral";
}

export function ptDisplay(card: PtCard): PtDisplay | null {
  const creature = card.types?.some((type) => type.toLowerCase() === "creature");
  if (!creature || !card.power || !card.toughness) return null;
  const toughness = parseStat(card.toughness);
  const lethal = card.damage != null && card.damage > 0 && card.damage >= toughness;
  return {
    power: card.power,
    toughness: card.toughness,
    powerTone: statTone(parseStat(card.power), card.basePower),
    toughnessTone: lethal ? "lethal" : statTone(toughness, card.baseToughness),
  };
}
