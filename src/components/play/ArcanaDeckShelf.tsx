import { ArcanaDeckSyncBar } from "@/components/deck/ArcanaDeckSyncBar";
import { ArcanaDeckTile } from "@/components/deck/ArcanaDeckTile";
import { DECK_SHELF_CARD_CLASS, DeckShelfRow } from "@/components/play/DeckShelfRow";
import { useArcanaLibrary } from "@/hooks/useArcanaLibrary";

export function ArcanaDeckShelf() {
  const { library, available, status, syncing, pendingDeckId, syncNow, play } = useArcanaLibrary();
  if (!library || !available) return null;
  return (
    <div className="space-y-2">
      <ArcanaDeckSyncBar
        status={status}
        error={library.lastError !== null}
        syncing={syncing}
        onSync={() => void syncNow()}
      />
      {library.decks.length === 0 ? (
        <p className="text-ui-body text-muted-foreground">No decks in Arcana yet.</p>
      ) : (
        <DeckShelfRow label={`Arcana decks`}>
          {library.decks.map((deck) => (
            <ArcanaDeckTile
              key={deck.deck_id}
              deck={deck}
              className={DECK_SHELF_CARD_CLASS}
              pending={pendingDeckId === deck.deck_id}
              disabled={pendingDeckId !== null}
              onPlay={() => void play(deck.deck_id)}
            />
          ))}
        </DeckShelfRow>
      )}
    </div>
  );
}
