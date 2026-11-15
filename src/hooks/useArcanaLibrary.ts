import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchArcanaLibrary, requestArcanaSync, type ArcanaLibrary } from "@/api/arcana";
import { useQuickPlaytest } from "@/hooks/useQuickPlaytest";
import { arcanaDeckToDeck } from "@/lib/arcanaDeck";
import { getAccessToken, useAuthStore } from "@/stores/useAuthStore";

const SYNC_REFRESH_DELAY_MS = 6000;

export function useArcanaLibrary() {
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
    else setLibrary(null);
  }, [signedIn, load]);

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

  const available = library !== null && (library.linked || library.decks.length > 0);
  const lastSynced = library?.lastSuccessAt
    ? `Synced ${new Date(library.lastSuccessAt).toLocaleString()}`
    : `Waiting for first sync`;
  const status = !library
    ? ""
    : library.lastError
      ? `${library.lastError} · ${lastSynced}`
      : lastSynced;

  return { library, available, status, syncing, pendingDeckId, syncNow, play };
}
