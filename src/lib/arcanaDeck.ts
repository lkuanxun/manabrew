import type { ArcanaCard, ArcanaDeck, ArcanaDeckEntry } from "@/api/arcana";
import { SCRYFALL_API } from "@/api/scryfall";
import { enqueueCardLookup } from "@/api/scryfallBatch";
import { scryfallToDeckCard } from "@/lib/scryfall.utils";
import type { Deck, DeckCard } from "@/protocol/deck";

export interface ArcanaDeckConversion {
  deck: Deck;
  unresolved: string[];
}

export function arcanaCardImageUrl(card: ArcanaCard): string {
  return card.faces[0]?.image_url ?? `${SCRYFALL_API}/cards/${card.printing_id}?format=image`;
}

async function resolvePrinting(card: ArcanaCard): Promise<DeckCard | null> {
  try {
    return scryfallToDeckCard(await enqueueCardLookup({ id: card.printing_id }));
  } catch {
    try {
      return scryfallToDeckCard(
        await enqueueCardLookup({ set: card.set_code, collector_number: card.collector_number }),
      );
    } catch {
      return null;
    }
  }
}

function copies(template: DeckCard, card: ArcanaCard, quantity: number): DeckCard[] {
  const foil = card.finish === "foil" || card.finish === "etched" ? true : undefined;
  return Array.from({ length: quantity }, () => ({
    ...template,
    identity: { ...template.identity, id: crypto.randomUUID(), foil },
  }));
}

export async function arcanaDeckToDeck(source: ArcanaDeck): Promise<ArcanaDeckConversion> {
  const entries: ArcanaDeckEntry[] = [...source.commanders, ...source.mainboard];
  const printings = new Map<string, Promise<DeckCard | null>>();
  for (const { card } of entries) {
    if (!printings.has(card.printing_id)) printings.set(card.printing_id, resolvePrinting(card));
  }
  const unresolved: string[] = [];
  async function expand(list: ArcanaDeckEntry[]): Promise<DeckCard[]> {
    const cards: DeckCard[] = [];
    for (const { card, quantity } of list) {
      const template = await printings.get(card.printing_id);
      if (template) cards.push(...copies(template, card, quantity));
      else unresolved.push(card.name);
    }
    return cards;
  }
  const commanders = await expand(source.commanders);
  const cards = await expand(source.mainboard);
  return {
    deck: {
      id: `arcana:${source.deck_id}`,
      name: source.name,
      format: source.format === "commander" ? "commander" : undefined,
      color: source.color_identity.join(""),
      cards,
      sideboard: [],
      commanders: commanders.length > 0 ? commanders : undefined,
      coverCardName: commanders[0]?.identity.name,
    },
    unresolved,
  };
}
