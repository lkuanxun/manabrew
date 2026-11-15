import { ArcanaDeckSyncBar } from "@/components/deck/ArcanaDeckSyncBar";
import { ArcanaDeckTile } from "@/components/deck/ArcanaDeckTile";
import type { useArcanaLibrary } from "@/hooks/useArcanaLibrary";

interface ArcanaDeckGridProps {
  arcana: ReturnType<typeof useArcanaLibrary>;
}

export function ArcanaDeckGrid({ arcana }: ArcanaDeckGridProps) {
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
            <ArcanaDeckTile
              key={deck.deck_id}
              deck={deck}
              pending={pendingDeckId === deck.deck_id}
              disabled={pendingDeckId !== null}
              onPlay={() => void play(deck.deck_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
