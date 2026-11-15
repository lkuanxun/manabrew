import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ArcanaDeckSyncBarProps {
  status: string;
  error: boolean;
  syncing: boolean;
  onSync: () => void;
}

export function ArcanaDeckSyncBar({ status, error, syncing, onSync }: ArcanaDeckSyncBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-ui-meta text-muted-foreground">
      <span className={cn("min-w-0 flex-1", error && "text-destructive")}>{status}</span>
      <Button variant="ghost" size="sm" disabled={syncing} onClick={onSync}>
        <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
        Sync now
      </Button>
    </div>
  );
}
