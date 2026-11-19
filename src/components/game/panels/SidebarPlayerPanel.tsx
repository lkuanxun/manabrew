import { Hourglass, Play } from "lucide-react";
import type { MouseEvent } from "react";
import { ManaSymbols } from "@/components/game/ManaSymbols";
import { ZONE_TILE_KEY } from "@/components/game/game.constants";
import { cn } from "@/lib/utils";
import type { CardDto } from "@/protocol/game";
import type { ZoneTileSpec } from "@/pixi/board/BoardZoneTiles";
import type { PlayerHudSpec } from "@/pixi/hud/playerHud.types";
import { MANA_LETTERS } from "@/themes/gameTheme";

export interface SidebarPlayer {
  hud: PlayerHudSpec;
  handCount: number;
  libraryCount: number;
  poison: number;
  zones: ZoneTileSpec[];
}

interface SidebarPlayerPanelProps {
  player: SidebarPlayer;
  targetColor: string;
  onSelect: (playerId: string) => void;
  onHoverCards: (cards: CardDto[] | null, anchor?: DOMRect) => void;
}

const ZONE_LABELS: Record<string, string> = {
  [ZONE_TILE_KEY.command]: "Command",
  [ZONE_TILE_KEY.graveyard]: "Graveyard",
  [ZONE_TILE_KEY.exile]: "Exile",
  [ZONE_TILE_KEY.junkyard]: "Junkyard",
};

export function SidebarPlayerPanel({
  player,
  targetColor,
  onSelect,
  onHoverCards,
}: SidebarPlayerPanelProps) {
  const { hud, zones } = player;
  const mana = MANA_LETTERS.map((letter) => `{${letter}}`.repeat(hud.manaPool[letter] ?? 0)).join(
    "",
  );
  const shownZones = zones.filter((zone) => ZONE_LABELS[zone.key]);
  const badges = hud.badges.filter((badge) => badge.id !== "hand");
  const hoverZone = (zone: ZoneTileSpec) => (event: MouseEvent<HTMLButtonElement>) => {
    const cards = zone.previewCards ?? (zone.topCard ? [zone.topCard] : null);
    if (cards) onHoverCards(cards, event.currentTarget.getBoundingClientRect());
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(hud.playerId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(hud.playerId);
      }}
      className={cn(
        "cursor-pointer rounded-md border border-l-4 bg-card p-2 text-left text-card-foreground",
        hud.isEliminated && "opacity-50",
        hud.isTargetable && "ring-2",
      )}
      style={{
        borderLeftColor: hud.color,
        ...(hud.isTargetable ? { ["--tw-ring-color" as string]: targetColor } : {}),
        ...(hud.isActiveTurn ? { borderColor: hud.color } : {}),
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-ui-label font-semibold">{hud.name}</span>
        {hud.isActiveTurn && <Play className="h-3.5 w-3.5 shrink-0" style={{ color: hud.color }} />}
        {hud.isPriorityPlayer && <Hourglass className="h-3.5 w-3.5 shrink-0 text-primary" />}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold tabular-nums leading-none">{hud.life}</span>
        <span className="text-ui-meta text-muted-foreground">
          Hand {player.handCount} · Lib {player.libraryCount}
          {player.poison > 0 && ` · Poison ${player.poison}`}
        </span>
      </div>
      {mana && <ManaSymbols cost={mana} size="sm" className="mt-1" />}
      {badges.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {badges.map((badge) => (
            <span
              key={badge.id}
              title={badge.label}
              className="max-w-full truncate rounded border px-1 text-ui-caption"
              style={{ borderColor: badge.color }}
            >
              {badge.label}
              {badge.count !== undefined && ` ${badge.count}`}
            </span>
          ))}
        </div>
      )}
      <div className="mt-1.5 space-y-1">
        {shownZones.map((zone) => {
          const commander = zone.key === ZONE_TILE_KEY.command;
          const detail = commander
            ? (zone.previewCards ?? []).map((card) => card.identity.name).join(" + ")
            : zone.topCard?.identity.name;
          return (
            <button
              key={zone.key}
              type="button"
              disabled={!zone.onOpen}
              onClick={(event) => {
                event.stopPropagation();
                zone.onOpen?.();
              }}
              onMouseEnter={hoverZone(zone)}
              onMouseLeave={() => onHoverCards(null)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded border px-1.5 py-0.5 text-left text-ui-meta",
                zone.onOpen && "hover:bg-muted",
                zone.highlightColor && "border-2",
              )}
              style={zone.highlightColor ? { borderColor: zone.highlightColor } : undefined}
            >
              <span className="shrink-0 font-semibold">
                {ZONE_LABELS[zone.key]} {zone.count}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{detail}</span>
              {commander && (zone.commanderTax ?? 0) > 0 && (
                <span className="shrink-0">Tax +{zone.commanderTax}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
