import {
  SidebarPlayerPanel,
  type SidebarPlayer,
} from "@/components/game/panels/SidebarPlayerPanel";
import type { CardDto } from "@/protocol/game";

interface GameSidebarProps {
  players: SidebarPlayer[];
  targetColor: string;
  onSelectPlayer: (playerId: string) => void;
  onHoverCards: (cards: CardDto[] | null, anchor?: DOMRect) => void;
}

export function GameSidebar({
  players,
  targetColor,
  onSelectPlayer,
  onHoverCards,
}: GameSidebarProps) {
  return (
    <aside
      aria-label={`Players`}
      className="relative z-20 flex w-60 shrink-0 flex-col gap-2 overflow-y-auto border-r bg-background p-2"
    >
      {players.map((player) => (
        <SidebarPlayerPanel
          key={player.hud.playerId}
          player={player}
          targetColor={targetColor}
          onSelect={onSelectPlayer}
          onHoverCards={onHoverCards}
        />
      ))}
    </aside>
  );
}
