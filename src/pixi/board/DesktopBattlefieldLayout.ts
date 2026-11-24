import { HAND_CARD_BASE } from "@/components/game/game.styles";
import { FIELD_INNER_EDGE_PAD_PX } from "../constants";
import { battlefieldScaleForMultiplier, scaleForRowsWithCombatRow } from "../GridLayout";
import { CARD_W } from "@/components/game/game.constants";
import { artCropTargetWidth, handCardTargetWidth } from "@/cardDisplay";
import { battlefieldCardHeight } from "../CardSprite";
import { computeBoardLayout } from "./boardLayout";
import { playmatGridArea } from "./PlaymatLayer";
import type { BattlefieldLayoutPolicy, BattlefieldLayoutResult } from "./battlefieldLayoutPolicy";

const OVERVIEW_OPPONENT_ROWS = 3;
const HAND_STRIP_SHARE = 0.2;

export const DESKTOP_BATTLEFIELD_LAYOUT: BattlefieldLayoutPolicy = {
  effectiveBottomReserve(requestedBottomReserve) {
    return requestedBottomReserve;
  },
  clusterHeight(_self, observedHandReserve, requestedBottomReserve) {
    return Math.max(observedHandReserve, requestedBottomReserve);
  },

  compute(input): BattlefieldLayoutResult {
    const handReserve = Math.round(input.height * HAND_STRIP_SHARE);
    const layout = computeBoardLayout(
      input.width,
      input.height,
      input.opponentCount,
      handReserve,
      false,
      0.5,
      input.opponentLayout,
    );
    const playmatTrim = (usable: number) => Math.max(1, usable - FIELD_INNER_EDGE_PAD_PX);
    const selfUsable = playmatTrim(Math.max(1, layout.self.height - handReserve));
    const selfGrid = playmatGridArea(
      layout.self,
      { ...layout.self, height: Math.max(1, layout.self.height - handReserve) },
      0,
    );
    const selfFromSeam = selfGrid.y + selfGrid.height - layout.self.y;
    const fitScale = Math.max(
      Number.EPSILON,
      battlefieldScaleForMultiplier(
        selfGrid.height,
        selfFromSeam,
        input.cardSizeMultiplier,
        battlefieldCardHeight(),
      ),
    );
    const selfScale = Math.min(
      fitScale,
      (artCropTargetWidth(window.innerWidth, window.innerHeight) * input.cardSizeMultiplier) /
        CARD_W,
    );
    const opponentUsables = layout.opponents.map((opponent) =>
      playmatTrim(Math.max(1, opponent.rect.height)),
    );
    const opponentUsable = opponentUsables.length ? Math.min(...opponentUsables) : selfUsable;
    const opponentScale =
      layout.opponentLayout === "overview"
        ? Math.max(
            Number.EPSILON,
            Math.min(
              selfScale,
              scaleForRowsWithCombatRow(
                opponentUsable,
                OVERVIEW_OPPONENT_ROWS,
                battlefieldCardHeight(),
              ),
            ),
          )
        : selfScale;
    return {
      layout,
      scales: { self: selfScale, opponent: opponentScale },
      handScale: handCardTargetWidth(window.innerWidth, window.innerHeight) / HAND_CARD_BASE.cardW,
      selfClusterMaxHeight: Math.max(input.observedHandReserve, handReserve),
    };
  },
};
