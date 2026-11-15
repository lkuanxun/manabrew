import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
interface RestrictionWarningsProps {
  items: { label?: string; warnings: string[] }[];
  className?: string;
}
export function RestrictionWarnings({ items, className }: RestrictionWarningsProps) {
  const lines = items.flatMap((item) =>
    item.warnings.map((warning) => (item.label ? `${item.label}: ${warning}` : warning)),
  );
  if (lines.length === 0) return null;
  return (
    <ul className={cn("space-y-0.5 text-ui-meta text-warning", className)}>
      {lines.map((line) => (
        <li key={line} className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">{line}</span>
        </li>
      ))}
    </ul>
  );
}
