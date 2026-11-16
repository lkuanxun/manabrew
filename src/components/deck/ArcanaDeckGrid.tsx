import { ArcanaDeckSyncBar } from "@/components/deck/ArcanaDeckSyncBar";
import { DeckCardPlayButton } from "@/components/deck/DeckCardPlayButton";
import { DeckCardSurface } from "@/components/deck/DeckCardSurface";
import { getDeckColorCost, getDeckNameColorClass } from "@/components/deck/deckDisplay.utils";
import { FormatBadge } from "@/components/game/FormatBadge";
import { ManaSymbols } from "@/components/game/ManaSymbols";
import { ScryfallImg } from "@/components/ScryfallImg";
import type { ArcanaDeck } from "@/api/arcana";
import type { useArcanaLibrary } from "@/hooks/useArcanaLibrary";
import { arcanaCardArtUrl } from "@/lib/arcanaDeck";

interface ArcanaDeckGridProps {
  arcana: ReturnType<typeof useArcanaLibrary>;
  onOpen: (deckId: string) => void;
}

export function ArcanaDeckGrid({ arcana, onOpen }: ArcanaDeckGridProps) {
  const { library, status, syncing, pendingDeckId, syncNow, play } = arcana;
  if (!library) return null;
  return (
    <div className="space-y-3">
      <ArcanaDeckSyncBar
        status={status}
        error={library.lastError !== null}
        syncing={syncing}
        onSync={() => void syncNow()}
      />
      {library.decks.length === 0 ? (
        <p className="text-ui-body text-muted-foreground">No decks in Arcana yet.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
          {library.decks.map((deck) => (
            <ArcanaDeckCard
              key={deck.deck_id}
              deck={deck}
              playing={pendingDeckId === deck.deck_id}
              playDisabled={pendingDeckId !== null}
              onOpen={() => onOpen(deck.deck_id)}
              onPlay={() => void play(deck.deck_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ArcanaDeckCard({
  deck,
  playing,
  playDisabled,
  onOpen,
  onPlay,
}: {
  deck: ArcanaDeck;
  playing: boolean;
  playDisabled: boolean;
  onOpen: () => void;
  onPlay: () => void;
}) {
  const colors = [{ color: deck.color_identity.join(""), manaCost: "" }];
  const colorCost = getDeckColorCost(colors);
  const commander = deck.commanders[0]?.card;
  const commanderNames = deck.commanders
    .map((entry) => entry.card.name.split(" // ")[0])
    .join(" + ");
  const total = [...deck.commanders, ...deck.mainboard].reduce(
    (sum, entry) => sum + entry.quantity,
    0,
  );
  return (
    <DeckCardSurface
      title={deck.name}
      subtitle={commanderNames && commanderNames !== deck.name ? commanderNames : undefined}
      ariaLabel={`Open ${deck.name}`}
      onOpen={onOpen}
      titleClassName={getDeckNameColorClass(colors)}
      cover={
        commander ? (
          <ScryfallImg
            src={arcanaCardArtUrl(commander)}
            alt={commander.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
          />
        ) : undefined
      }
      topLeft={<DeckCardPlayButton playing={playing} disabled={playDisabled} onPlay={onPlay} />}
      footer={
        <>
          <FormatBadge formatId="commander" />
          {colorCost && <ManaSymbols cost={colorCost} size="sm" />}
          <span className="rounded-full border border-border/70 bg-background/80 px-1.5 py-0.5 text-ui-meta font-medium text-foreground backdrop-blur-sm">
            Arcana
          </span>
          <span className="ml-auto text-ui-meta text-text-on-tinted/85">{total} cards</span>
        </>
      }
    />
  );
}
