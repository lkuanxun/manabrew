import { PHASES } from "@/components/game/game.constants";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import type { PlayerHudSpec } from "@/pixi/hud/playerHud.types";
import type { StepKind } from "@/protocol";
import { readableTextColor } from "@/themes/gameTheme";

interface PhaseBarProps {
  players: PlayerHudSpec[];
  turnOrder: string[];
  round: number;
  step: StepKind;
}

export function PhaseBar({ players, turnOrder, round, step }: PhaseBarProps) {
  const { gameTheme } = useTheme();
  const active = players.find((player) => player.isActiveTurn);
  const alive = turnOrder.filter(
    (id) => !players.find((player) => player.playerId === id)?.isEliminated,
  );
  const activeIndex = active ? alive.indexOf(active.playerId) : -1;
  const nextId = activeIndex >= 0 ? alive[(activeIndex + 1) % alive.length] : undefined;
  const next = players.find((player) => player.playerId === nextId);
  const ink = active
    ? readableTextColor(active.color, gameTheme.canvas.shadow, gameTheme.textOnTinted)
    : undefined;
  return (
    <div className="flex h-8 shrink-0 items-stretch gap-1 border-t bg-card px-2 text-card-foreground">
      <div className="flex shrink-0 items-center gap-2 pr-2 text-ui-label">
        <span className="font-semibold">
          Round {round}
          {active && (
            <>
              {": "}
              <span style={{ color: active.color }}>{active.name}</span>
            </>
          )}
        </span>
        {next && next.playerId !== active?.playerId && (
          <span className="text-ui-meta text-muted-foreground">
            Next: <span style={{ color: next.color }}>{next.name}</span>
          </span>
        )}
      </div>
      {PHASES.map((phase) => {
        const current = phase.id === step;
        return (
          <span
            key={phase.id}
            className={cn(
              "my-1 flex min-w-0 flex-1 items-center justify-center truncate rounded px-1 text-ui-caption",
              current ? "font-bold" : "text-muted-foreground",
            )}
            style={current && active ? { backgroundColor: active.color, color: ink } : undefined}
          >
            {phase.label}
          </span>
        );
      })}
    </div>
  );
}
