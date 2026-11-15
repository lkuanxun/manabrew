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
