import { Info, Palette, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { DESIGN_SYSTEM_ENABLED } from "@/config/designSystem";
import { APP_VERSION, ROUTES } from "@/lib/constants";
const UTILITY_ROW_CLASS =
  "flex min-w-0 items-center gap-3 px-4 py-3 text-ui-label hover:bg-muted/50 motion-safe:transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
export function PlayHomeLinks() {
  return (
    <>
      <section
        aria-label={`Utilities`}
        className="overflow-hidden rounded-xl border border-border/60 bg-background/60 backdrop-blur-md"
      >
        <ul className="divide-y divide-border/50 pb-1">
          <li>
            <Link to={ROUTES.SETTINGS} className={UTILITY_ROW_CLASS}>
              <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
              Preferences
            </Link>
          </li>
          <li>
            <Link to={ROUTES.ABOUT} className={UTILITY_ROW_CLASS}>
              <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
              About Manabrew
            </Link>
          </li>
          {DESIGN_SYSTEM_ENABLED && (
            <li>
              <Link to={ROUTES.DESIGN_SYSTEM} className={UTILITY_ROW_CLASS}>
                <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
                Design System
              </Link>
            </li>
          )}
        </ul>
      </section>

      <footer className="flex flex-col gap-3 border-t border-border/50 pt-5">
        <span className="text-ui-caption text-muted-foreground">Manabrew v{APP_VERSION}</span>
      </footer>
    </>
  );
}
