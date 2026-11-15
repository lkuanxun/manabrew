import { useEffect } from "react";
import { create } from "zustand";
import { fetchArcanaRules } from "@/api/arcana";
import { toFormatRestrictions, type FormatRestrictions } from "@/lib/formatRestrictions";
import { getAccessToken, useAuthStore } from "@/stores/useAuthStore";
interface ArcanaRulesState {
  restrictions: FormatRestrictions | null;
  loading: boolean;
  ensureLoaded: () => Promise<void>;
  clear: () => void;
}
export const useArcanaRulesStore = create<ArcanaRulesState>((set, get) => ({
  restrictions: null,
  loading: false,
  ensureLoaded: async () => {
    if (get().restrictions || get().loading) return;
    const token = await getAccessToken();
    if (!token) return;
    set({ loading: true });
    try {
      const rules = await fetchArcanaRules(token);
      set({ restrictions: rules ? toFormatRestrictions(rules) : null });
    } catch {
      set({ restrictions: null });
    } finally {
      set({ loading: false });
    }
  },
  clear: () => set({ restrictions: null }),
}));
export function useFormatRestrictions(): FormatRestrictions | null {
  const signedIn = useAuthStore((state) => state.status === "signedIn");
  const restrictions = useArcanaRulesStore((state) => state.restrictions);
  const ensureLoaded = useArcanaRulesStore((state) => state.ensureLoaded);
  const clear = useArcanaRulesStore((state) => state.clear);
  useEffect(() => {
    if (signedIn) void ensureLoaded();
    else clear();
  }, [signedIn, ensureLoaded, clear]);
  return restrictions;
}
