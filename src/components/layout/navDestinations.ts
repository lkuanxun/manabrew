import type { ComponentType } from "react";
import { Info, Layers, Library, LibraryBig, Palette, Swords, Users } from "lucide-react";
import { DESIGN_SYSTEM_ENABLED } from "@/config/designSystem";
import { isFeatureEnabled } from "@/featureFlags";
import { ROUTES } from "@/lib/constants";
export interface NavDestination {
  to: string;
  label: string;
  icon: ComponentType<{
    className?: string;
  }>;
  external?: boolean;
}
export function isNavDestinationActive(to: string, pathname: string): boolean {
  pathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (to === ROUTES.PLAY_OFFLINE_CONSTRUCTED) {
    return (
      pathname.startsWith(ROUTES.PLAY_OFFLINE) ||
      (pathname.startsWith(`${ROUTES.DRAFT}/`) && pathname !== `${ROUTES.DRAFT}/multiplayer`) ||
      (pathname.startsWith(`${ROUTES.SEALED}/`) && pathname !== `${ROUTES.SEALED}/multiplayer`) ||
      pathname.startsWith(`${ROUTES.WINSTON}/`) ||
      pathname.startsWith(`${ROUTES.GAUNTLET}/`)
    );
  }
  if (to === ROUTES.LOBBY) {
    return (
      pathname === ROUTES.LOBBY ||
      pathname === `${ROUTES.DRAFT}/multiplayer` ||
      pathname === `${ROUTES.SEALED}/multiplayer`
    );
  }
  if (to === ROUTES.PLAY) {
    return pathname === ROUTES.PLAY;
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}
export function getTopBarNav(): NavDestination[] {
  const direct: NavDestination[] = [
    { to: ROUTES.PLAY_OFFLINE_CONSTRUCTED, label: `Singleplayer`, icon: Swords },
    { to: ROUTES.LOBBY, label: `Multiplayer`, icon: Users },
    { to: ROUTES.DECK_EDITOR, label: `My Decks`, icon: Layers },
  ];
  if (isFeatureEnabled("accounts")) {
    direct.push({ to: ROUTES.MY_COLLECTION, label: `Collection`, icon: Library });
  }
  if (isFeatureEnabled("deckHub")) {
    direct.push({ to: ROUTES.HUB, label: `Community`, icon: LibraryBig });
  }
  return direct;
}
export function getMoreDestinations(): NavDestination[] {
  const more: NavDestination[] = [{ to: ROUTES.ABOUT, label: `About`, icon: Info }];
  if (DESIGN_SYSTEM_ENABLED) {
    more.push({ to: ROUTES.DESIGN_SYSTEM, label: `Design System`, icon: Palette });
  }
  return more;
}
