# Card display module

Owns the battlefield card and hand fan presentation modeled on phase.rs (`phase-rs/phase`, MIT/Apache-2.0): the art crop tile, its P/T box, tapped treatment and the summoning-sickness ripple. Import it through `@/cardDisplay`; files outside the module do not reach into `pixi/` or the helpers directly.

| File                              | Role                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `cardDisplay.constants.ts`        | Art crop aspect (4:3 landscape), 17° tap angle, tapped alpha, frame and ripple proportions                                                    |
| `artCropSize.ts`                  | Phase's responsive art crop width (CSS px from viewport size), the desktop cap times `cardSizeMultiplier`                                     |
| `frameColors.ts`                  | Frame colors from `CardDto.color`, falling back to basic land subtypes, then colorless (`theme.mana`)                                         |
| `handFan.ts`                      | Phase's wide fan: overlap by hand size, per-card tilt and parabolic drop; `pixi/HandLayout` uses it for every arced hand (local and opponent) |
| `ptDisplay.ts`                    | `ptTone` (one tone for the whole P/T badge) and `ptDisplay` (separate power and toughness tones)                                              |
| `pixi/ArtCropChrome.ts`           | Pixi frame: `back` goes under the artwork, `front` over it; `artRect` is the artwork window                                                   |
| `pixi/SummoningSicknessRipple.ts` | Animated ellipse and rings over the artwork; static when animations are off                                                                   |
| `ArtCropCardFace.tsx`             | DOM twin used by the settings preview                                                                                                         |

`CardSprite` always renders the art crop for `kind === "battlefield"`; zone tiles and the hand keep printed faces. The art crop footprint is `CARD_W × CARD_W·ART_CROP_ASPECT` on desktop (`battlefieldCardHeight()`); `DesktopBattlefieldLayout` fits rows with that height and caps the width at `artCropTargetWidth`, and the mobile scene keeps its square footprint. Face-down and realistic-only cards cover-fit their image into the same footprint without the chrome.

The desktop hand is arced (`DesktopBoardScenePresentation` no longer sets it flat): cards rest `HAND_FAN.restingSinkFrac` below the edge. Hand card width follows phase's `--hand-card-w` (`handCardTargetWidth`, `HAND_CARD_WIDTH_STEPS`), from the browser viewport rather than the canvas. Hover straightens the card, scales it by `HAND_FAN.hoverScale` and lifts it fully above the edge, because the hover preview does not open for desktop hand cards; phase instead keeps a 1.08 hover and shows a separate preview.

Every color comes from the game theme: frames from `mana`, the P/T box from `cardPaper`, stat tones from `pt`, the ripple from `cardStatus.summoningSick`. The pre-rewrite styles are archived at the local tag `archive/manabrew-card-styles`.
