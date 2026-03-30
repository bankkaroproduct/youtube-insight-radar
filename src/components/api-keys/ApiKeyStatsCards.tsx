import { Card, CardContent } from "@/components/ui/card";
import { KeyRound, CheckCircle, AlertTriangle, Gauge } from "lucide-react";

interface Props {
  total: number;
  active: number;
  exhausted: number;
  quotaRemaining: number;
}

export function ApiKeyStatsCards({ total, active, exhausted, quotaRemaining }: Props) {
  const cards = [
    { label: "Total Keys", value: total, icon: KeyRound, color: "text-primary" },
    { label: "Active Keys", value: active, icon: CheckCircle, color: "text-green-500" },
    { label: "Exhausted Today", value: exhausted, icon: AlertTriangle, color: "text-destructive" },
    { label: "Quota Remaining", value: quotaRemaining.toLocaleString(), icon: Gauge, color: "text-blue-500" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
