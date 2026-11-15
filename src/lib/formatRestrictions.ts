import type { ArcanaRoleRestriction, ArcanaRuleCard, ArcanaRules } from "@/api/arcana";
import { resolveDeckSections, type DeckValidationInput } from "@/lib/formats";
import { normalizeCardName } from "@/lib/gameChangers";
import type { DeckCard } from "@/protocol/deck";
const RULE_PROFILE_BY_FORMAT: Record<string, string> = {
  duelcommander: "arcana-custom-duel",
  commander: "commander-b3",
};
interface CardMatcher {
  oracleIds: Set<string>;
  names: Set<string>;
}
interface FormatRuleSet {
  banned: CardMatcher;
  commanderRestricted: CardMatcher;
  companionRestricted: CardMatcher;
  gameChangers: CardMatcher;
  gameChangerLimit: number | null | undefined;
}
export type FormatRestrictions = Record<string, FormatRuleSet>;
function matcher(cards: ArcanaRuleCard[]): CardMatcher {
  return {
    oracleIds: new Set(cards.flatMap((card) => (card.oracle_id ? [card.oracle_id] : []))),
    names: new Set(cards.map((card) => normalizeCardName(card.name))),
  };
}
function roleMatcher(cards: ArcanaRoleRestriction[], scope: ArcanaRoleRestriction["scope"]) {
  return matcher(cards.filter((card) => card.scope === scope));
}
function matches(card: DeckCard, list: CardMatcher): boolean {
  const oracleId = card.identity.oracleId;
  return (
    (oracleId !== undefined && list.oracleIds.has(oracleId)) ||
    list.names.has(normalizeCardName(card.identity.name))
  );
}
function ruleSet(
  rules: ArcanaRules,
  formatId: string,
  banned: ArcanaRuleCard[],
  restricted: ArcanaRoleRestriction[],
): FormatRuleSet {
  return {
    banned: matcher(banned),
    commanderRestricted: roleMatcher(restricted, "commander"),
    companionRestricted: roleMatcher(restricted, "companion"),
    gameChangers: matcher(rules.game_changers),
    gameChangerLimit: rules.rule_profiles[RULE_PROFILE_BY_FORMAT[formatId]]?.game_changer_limit,
  };
}
export function toFormatRestrictions(rules: ArcanaRules): FormatRestrictions {
  return {
    duelcommander: ruleSet(
      rules,
      "duelcommander",
      rules.duel_banned,
      rules.duel_commander_restricted,
    ),
    commander: ruleSet(rules, "commander", rules.commander_banned, rules.commander_restricted),
  };
}
function uniqueNames(cards: DeckCard[]): string[] {
  return [...new Set(cards.map((card) => card.identity.name))];
}
export function restrictionWarnings(
  input: DeckValidationInput,
  formatId: string,
  restrictions: FormatRestrictions | null,
): string[] {
  const rules = restrictions?.[formatId];
  if (!rules) return [];
  const formatName = formatId === "duelcommander" ? "Duel Commander" : "Commander";
  const { commanders, mainDeck } = resolveDeckSections(input);
  const companion = input.deck.companion ? [input.deck.companion] : [];
  const deckCards = [...commanders, ...mainDeck, ...companion];
  const warnings: string[] = [];
  const banned = uniqueNames(deckCards.filter((card) => matches(card, rules.banned)));
  if (banned.length > 0) warnings.push(`Banned in ${formatName}: ${banned.join(", ")}`);
  const commanderRestricted = uniqueNames(
    commanders.filter((card) => matches(card, rules.commanderRestricted)),
  );
  if (commanderRestricted.length > 0) {
    warnings.push(`Cannot be a commander in ${formatName}: ${commanderRestricted.join(", ")}`);
  }
  const companionRestricted = uniqueNames(
    companion.filter((card) => matches(card, rules.companionRestricted)),
  );
  if (companionRestricted.length > 0) {
    warnings.push(`Cannot be a companion in ${formatName}: ${companionRestricted.join(", ")}`);
  }
  const gameChangers = uniqueNames(
    [...commanders, ...mainDeck].filter((card) => matches(card, rules.gameChangers)),
  );
  const limit = rules.gameChangerLimit;
  if (limit !== null && limit !== undefined && gameChangers.length > limit) {
    warnings.push(
      `${gameChangers.length} Game Changers (max ${limit}): ${gameChangers.join(", ")}`,
    );
  }
  return warnings;
}
