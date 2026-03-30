import { Card, CardContent } from "@/components/ui/card";
import { KeyRound, CheckCircle, XCircle, AlertTriangle, Gauge } from "lucide-react";

interface Props {
  total: number;
  healthy: number;
  invalid: number;
  exhausted: number;
  quotaRemaining: number;
}

export function ApiKeyStatsCards({ total, healthy, invalid, exhausted, quotaRemaining }: Props) {
  const cards = [
    { label: "Total Keys", value: total, icon: KeyRound, color: "text-primary" },
    { label: "Healthy Keys", value: healthy, icon: CheckCircle, color: "text-green-500" },
    { label: "Invalid Keys", value: invalid, icon: XCircle, color: "text-destructive" },
    { label: "Exhausted Today", value: exhausted, icon: AlertTriangle, color: "text-amber-500" },
    { label: "Quota Remaining", value: quotaRemaining.toLocaleString(), icon: Gauge, color: "text-blue-500" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <c.icon className={`h-8 w-8 ${c.color}`} />
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-sm text-muted-foreground">{c.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
