import { Hourglass, Play } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import type { BoardCanvasLayout } from "@/pixi/BoardCanvas";
import type { PlayerHudSpec } from "@/pixi/hud/playerHud.types";
import { readableTextColor } from "@/themes/gameTheme";

interface RegionPlayer {
  hud: PlayerHudSpec;
  handCount: number;
}

interface RegionHeadersProps {
  layout: BoardCanvasLayout | null;
  players: RegionPlayer[];
}

const OUTLINE_PX = 3;

export function RegionHeaders({ layout, players }: RegionHeadersProps) {
  const { gameTheme } = useTheme();
  return (
    <div className="relative h-7 shrink-0 bg-background">
      {layout?.opponents.map(({ playerId, rect }) => {
        const player = players.find((entry) => entry.hud.playerId === playerId);
        if (!player) return null;
        const { hud } = player;
        const ink = hud.isActiveTurn
          ? readableTextColor(hud.color, gameTheme.canvas.shadow, gameTheme.textOnTinted)
          : undefined;
        return (
          <div
            key={playerId}
            className={cn(
              "absolute inset-y-0 flex items-center gap-2 overflow-hidden rounded-t-md border-b-2 bg-card px-2 text-ui-label text-card-foreground",
              hud.isEliminated && "opacity-50",
            )}
            style={{
              left: rect.x,
              width: rect.width,
              borderColor: hud.color,
              ...(hud.isActiveTurn
                ? {
                    borderWidth: OUTLINE_PX,
                    borderBottomWidth: 0,
                    backgroundColor: hud.color,
                    color: ink,
                  }
                : {}),
            }}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-card"
              style={{ backgroundColor: hud.color }}
            />
            <span className="min-w-0 truncate font-semibold">{hud.name}</span>
            <span className="shrink-0 font-mono font-bold tabular-nums">{hud.life}</span>
            <span className={cn("shrink-0 text-ui-meta", !ink && "text-muted-foreground")}>
              Hand {player.handCount}
            </span>
            {hud.isActiveTurn && <Play className="h-3.5 w-3.5 shrink-0" />}
            {hud.isPriorityPlayer && <Hourglass className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </div>
        );
      })}
    </div>
  );
}

interface RegionOutlinesProps {
  layout: BoardCanvasLayout | null;
  localPlayerId: string;
  players: RegionPlayer[];
}

export function RegionOutlines({ layout, localPlayerId, players }: RegionOutlinesProps) {
  if (!layout) return null;
  const active = players.find((player) => player.hud.isActiveTurn)?.hud;
  if (!active) return null;
  const rect =
    active.playerId === localPlayerId
      ? layout.self
      : layout.opponents.find((opponent) => opponent.playerId === active.playerId)?.rect;
  if (!rect) return null;
  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        border: `${OUTLINE_PX}px solid ${active.color}`,
        borderTopWidth: active.playerId === localPlayerId ? OUTLINE_PX : 0,
      }}
    />
  );
}
