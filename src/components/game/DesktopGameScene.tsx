import { useState, type ReactNode, type RefObject } from "react";

import type { BoardOverlayCanvasProps } from "@/pixi/BoardOverlayCanvas";
import { DesktopBoardCanvas, type DesktopBoardCanvasProps } from "@/pixi/DesktopBoardCanvas";
import { DesktopBoardOverlayCanvas } from "@/pixi/DesktopBoardOverlayCanvas";
import type { BoardScene } from "@/pixi/board/BoardScene";

interface DesktopGameSceneProps {
  battlefieldContainerRef?: RefObject<HTMLDivElement | null>;
  sidebar: ReactNode;
  regionHeaders: ReactNode;
  regionOutlines: ReactNode;
  phaseBar: ReactNode;
  board: Omit<DesktopBoardCanvasProps, "onSceneChange">;
  overlay: Omit<BoardOverlayCanvasProps, "scene">;
}

export function DesktopGameScene({
  battlefieldContainerRef,
  sidebar,
  regionHeaders,
  regionOutlines,
  phaseBar,
  board,
  overlay,
}: DesktopGameSceneProps) {
  const [scene, setScene] = useState<BoardScene | null>(null);
  return (
    <div className="absolute inset-0 flex">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {regionHeaders}
        <div className="relative min-h-0 flex-1">
          <div ref={battlefieldContainerRef} className="absolute inset-0 z-10 overflow-hidden">
            <DesktopBoardCanvas {...board} onSceneChange={setScene} />
          </div>
          {regionOutlines}
          <div className="pointer-events-none absolute inset-0 z-[9000]">
            <DesktopBoardOverlayCanvas {...overlay} scene={scene} />
          </div>
        </div>
        {phaseBar}
      </div>
    </div>
  );
}
