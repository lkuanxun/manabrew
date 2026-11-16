import { AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
interface DeckStatusSummaryProps {
  legalityErrors: number;
  unsupportedCards: number;
  onNavigate: () => void;
}
export function DeckStatusSummary({
  legalityErrors,
  unsupportedCards,
  onNavigate,
}: DeckStatusSummaryProps) {
  const issueCount = legalityErrors + unsupportedCards;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "min-h-7 h-auto touch:min-h-11 touch:min-w-11 shrink-0 gap-1.5 whitespace-normal text-ui-label",
            issueCount > 0 ? "text-warning" : "text-legality-legal",
          )}
        >
          {issueCount > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          {issueCount > 0 ? `${issueCount} to review` : `Deck healthy`}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <StatusItem
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label={`Format legality`}
          value={legalityErrors > 0 ? `${legalityErrors} issues` : "Legal"}
          warning={legalityErrors > 0}
          onSelect={onNavigate}
        />
        <StatusItem
          icon={<Wrench className="h-3.5 w-3.5" />}
          label={`Engine support`}
          value={unsupportedCards > 0 ? `${unsupportedCards} unsupported` : "Supported"}
          warning={unsupportedCards > 0}
          onSelect={onNavigate}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function StatusItem({
  icon,
  label,
  value,
  warning = false,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  warning?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className="flex-wrap gap-2 text-ui-label touch:min-h-11 touch:min-w-11"
      onSelect={onSelect}
    >
      <span className={cn(warning ? "text-warning" : "text-muted-foreground")}>{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
      <span className={cn("text-ui-meta", warning ? "text-warning" : "text-muted-foreground")}>
        {value}
      </span>
    </DropdownMenuItem>
  );
}
