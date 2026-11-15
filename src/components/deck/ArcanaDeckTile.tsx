import { Layers, Play } from "lucide-react";
import type { ArcanaDeck } from "@/api/arcana";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ArcanaDeckTileProps {
  deck: ArcanaDeck;
  pending: boolean;
  disabled: boolean;
  className?: string;
  onPlay: () => void;
}

export function ArcanaDeckTile({
  deck,
  pending,
  disabled,
  className,
  onPlay,
}: ArcanaDeckTileProps) {
  const total = [...deck.commanders, ...deck.mainboard].reduce(
    (sum, entry) => sum + entry.quantity,
    0,
  );
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-4",
        className,
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
      <Button variant="primary" size="sm" className="mt-auto" disabled={disabled} onClick={onPlay}>
        <Play className="h-4 w-4" />
        {pending ? `Loading…` : `Play`}
      </Button>
    </div>
  );
}
