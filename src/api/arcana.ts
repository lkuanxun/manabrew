import { getHubApiUrl } from "@/config/webRuntimeConfig";
import { platformFetch } from "@/lib/platformFetch";

export type ArcanaFinish = "nonfoil" | "foil" | "etched" | "unknown";

export interface ArcanaCard {
  oracle_id: string;
  printing_id: string;
  name: string;
  printed_name: string | null;
  lang: string;
  set_code: string;
  collector_number: string;
  finish: ArcanaFinish;
  color_identity: string[];
  faces: { name: string; printed_name: string | null; image_url: string | null }[];
}

export interface ArcanaDeckEntry {
  card: ArcanaCard;
  quantity: number;
}

export interface ArcanaDeck {
  deck_id: string;
  revision: string;
  name: string;
  format: string;
  ruleset: string;
  color_identity: string[];
  commanders: ArcanaDeckEntry[];
  mainboard: ArcanaDeckEntry[];
  updated_at: string;
}

export interface ArcanaHolding {
  holding_id: string;
  card: ArcanaCard;
  present: boolean;
}

export interface ArcanaLibrary {
  linked: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  decks: ArcanaDeck[];
  collection: ArcanaHolding[] | null;
}

async function arcanaRequest(path: string, token: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await platformFetch(`${getHubApiUrl()}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`Arcana library request failed (${response.status})`);
  return response;
}

export async function fetchArcanaLibrary(token: string): Promise<ArcanaLibrary> {
  return (await (await arcanaRequest("/api/arcana/library", token)).json()) as ArcanaLibrary;
}

export async function requestArcanaSync(token: string): Promise<void> {
  await arcanaRequest("/api/arcana/sync", token, { method: "POST" });
}
export interface ArcanaRuleCard {
  name: string;
  oracle_id?: string | null;
}
export interface ArcanaRoleRestriction extends ArcanaRuleCard {
  scope: "commander" | "companion";
}
export interface ArcanaRuleProfile {
  bracket?: number | null;
  game_changer_limit: number | null;
}
export interface ArcanaRules {
  revision: string;
  updated_at: string;
  duel_banned: ArcanaRuleCard[];
  duel_commander_restricted: ArcanaRoleRestriction[];
  commander_banned: ArcanaRuleCard[];
  commander_restricted: ArcanaRoleRestriction[];
  game_changers: ArcanaRuleCard[];
  rule_profiles: Record<string, ArcanaRuleProfile>;
}
export async function fetchArcanaRules(token: string): Promise<ArcanaRules | null> {
  return (await (await arcanaRequest("/api/arcana/rules", token)).json()) as ArcanaRules | null;
}
