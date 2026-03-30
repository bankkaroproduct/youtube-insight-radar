import { useState } from "react";
import { cn } from "@/lib/utils";

interface ExpandableTextProps {
  text: string;
  maxLength?: number;
  className?: string;
}

export function ExpandableText({ text, maxLength = 100, className }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span className="text-muted-foreground">—</span>;
  if (text.length <= maxLength) return <span className={className}>{text}</span>;

  return (
    <span className={cn("text-sm", className)}>
      {expanded ? text : text.slice(0, maxLength) + "…"}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="ml-1 text-primary text-xs hover:underline font-medium"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </span>
  );
}
