import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Layers, Play, RefreshCw } from "lucide-react";
import { fetchArcanaLibrary, requestArcanaSync, type ArcanaLibrary } from "@/api/arcana";
import { DECK_SHELF_CARD_CLASS, DeckShelfRow } from "@/components/play/DeckShelfRow";
import { Button } from "@/components/ui/button";
import { useQuickPlaytest } from "@/hooks/useQuickPlaytest";
import { arcanaDeckToDeck } from "@/lib/arcanaDeck";
import { cn } from "@/lib/utils";
import { getAccessToken, useAuthStore } from "@/stores/useAuthStore";

const SYNC_REFRESH_DELAY_MS = 6000;

export function ArcanaDeckShelf() {
  const signedIn = useAuthStore((state) => state.status === "signedIn");
  const { quickPlaytest } = useQuickPlaytest();
  const [library, setLibrary] = useState<ArcanaLibrary | null>(null);
  const [pendingDeckId, setPendingDeckId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      setLibrary(await fetchArcanaLibrary(token));
    } catch {
      setLibrary(null);
    }
  }, []);

  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  if (!library || (!library.linked && library.decks.length === 0)) return null;

  async function syncNow() {
    const token = await getAccessToken();
    if (!token) return;
    setSyncing(true);
    try {
      await requestArcanaSync(token);
      await new Promise((resolve) => setTimeout(resolve, SYNC_REFRESH_DELAY_MS));
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function play(deckId: string) {
    const source = library?.decks.find((deck) => deck.deck_id === deckId);
    if (!source) return;
    setPendingDeckId(deckId);
    try {
      const { deck, unresolved } = await arcanaDeckToDeck(source);
      if (unresolved.length > 0) {
        toast.warning(`Could not find ${unresolved.length} card(s): ${unresolved.join(", ")}`);
      }
      quickPlaytest(deck);
    } finally {
      setPendingDeckId(null);
    }
  }

  const status = library.lastError
    ? library.lastError
    : library.lastSuccessAt
      ? `Synced ${new Date(library.lastSuccessAt).toLocaleString()}`
      : `Waiting for first sync`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-ui-meta text-muted-foreground">
        <span className={cn("min-w-0 flex-1", library.lastError && "text-destructive")}>
          {status}
        </span>
        <Button variant="ghost" size="sm" disabled={syncing} onClick={() => void syncNow()}>
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          Sync now
        </Button>
      </div>
      {library.decks.length === 0 ? (
        <p className="text-ui-body text-muted-foreground">No decks in Arcana yet.</p>
      ) : (
        <DeckShelfRow label={`Arcana decks`}>
          {library.decks.map((deck) => {
            const total =
              deck.commanders.reduce((sum, entry) => sum + entry.quantity, 0) +
              deck.mainboard.reduce((sum, entry) => sum + entry.quantity, 0);
            return (
              <div
                key={deck.deck_id}
                className={cn(
                  DECK_SHELF_CARD_CLASS,
                  "flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-4",
                )}
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 shrink-0 text-secondary" />
                  <span className="truncate font-semibold">{deck.name}</span>
                </div>
                <p className="line-clamp-2 text-ui-meta text-muted-foreground">
                  {deck.commanders.map((entry) => entry.card.name.split(" // ")[0]).join(" + ")}
                </p>
                <p className="text-ui-caption text-muted-foreground">
                  {deck.color_identity.join("") || "C"} · {total} cards
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-auto"
                  disabled={pendingDeckId !== null}
                  onClick={() => void play(deck.deck_id)}
                >
                  <Play className="h-4 w-4" />
                  {pendingDeckId === deck.deck_id ? `Loading…` : `Play`}
                </Button>
              </div>
            );
          })}
        </DeckShelfRow>
      )}
    </div>
  );
}
