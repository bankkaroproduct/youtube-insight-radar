import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";

export default function Triggers() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Triggers</h1>
        <p className="text-muted-foreground mt-1">Automated rules and trigger management.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Zap className="h-5 w-5" /> Automated Triggers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Automated triggers coming in Phase 8.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
