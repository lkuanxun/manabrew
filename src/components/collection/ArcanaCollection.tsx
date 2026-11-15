import { useMemo, useState, type MouseEvent } from "react";
import { CollectionCard } from "@/components/collection/CollectionCard";
import { ArcanaDeckSyncBar } from "@/components/deck/ArcanaDeckSyncBar";
import { Button } from "@/components/ui/button";
import type { ArcanaCard, ArcanaFinish } from "@/api/arcana";
import type { useArcanaLibrary } from "@/hooks/useArcanaLibrary";
import { cn } from "@/lib/utils";
import type { DeckCard } from "@/protocol/deck";

const PAGE_SIZE = 100;

const FOIL_BY_FINISH: Record<ArcanaFinish, boolean | undefined> = {
  nonfoil: false,
  foil: true,
  etched: true,
  unknown: undefined,
};

interface ArcanaCollectionProps {
  arcana: ReturnType<typeof useArcanaLibrary>;
  query: string;
  view: "text" | "grid";
  onHover: (card: DeckCard, event: MouseEvent) => void;
  onLeave: () => void;
}

export function ArcanaCollection({ arcana, query, view, onHover, onLeave }: ArcanaCollectionProps) {
  const [visibleRowCount, setVisibleRowCount] = useState(PAGE_SIZE);
  const rows = useMemo(() => {
    const grouped = new Map<string, { card: ArcanaCard; quantity: number }>();
    for (const holding of arcana.library?.collection ?? []) {
      const key = `${holding.card.printing_id}:${holding.card.finish}`;
      const entry = grouped.get(key);
      if (entry) entry.quantity += 1;
      else grouped.set(key, { card: holding.card, quantity: 1 });
    }
    return [...grouped.entries()]
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => a.card.name.localeCompare(b.card.name) || a.key.localeCompare(b.key));
  }, [arcana.library]);
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(({ card }) =>
        `${card.name} ${card.printed_name ?? ""} ${card.set_code}`.toLowerCase().includes(needle),
      )
    : rows;
  const visible = filtered.slice(0, visibleRowCount);
  const empty = arcana.library?.collection === null;

  return (
    <div className="mt-4 space-y-4">
      <ArcanaDeckSyncBar
        status={arcana.status}
        error={!!arcana.library?.lastError}
        syncing={arcana.syncing}
        onSync={() => void arcana.syncNow()}
      />
      <div
        className={cn(
          view === "text"
            ? "overflow-hidden rounded-xl border"
            : "grid grid-cols-2 gap-x-4 gap-y-6 @min-[36rem]:grid-cols-3 @min-[56rem]:grid-cols-4",
        )}
      >
        {visible.map(({ key, card, quantity }) => (
          <CollectionCard
            key={key}
            name={card.name}
            setCode={card.set_code}
            collectorNumber={card.collector_number}
            foil={FOIL_BY_FINISH[card.finish]}
            quantity={quantity}
            view={view}
            onHover={onHover}
            onLeave={onLeave}
          />
        ))}
        {filtered.length === 0 && (
          <div
            className={cn(
              "px-4 py-16 text-center text-ui-body text-muted-foreground",
              view === "grid" && "col-span-full rounded-xl border",
            )}
          >
            {empty
              ? `Arcana has not shared a collection yet.`
              : needle
                ? `No cards match your search.`
                : `Your Arcana collection is empty.`}
          </div>
        )}
      </div>
      {visible.length < filtered.length && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setVisibleRowCount((count) => count + PAGE_SIZE)}
          >
            Show {PAGE_SIZE} more · {filtered.length - visible.length} remaining
          </Button>
        </div>
      )}
    </div>
  );
}
