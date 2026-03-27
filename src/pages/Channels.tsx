import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function Channels() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Channels</h1>
        <p className="text-muted-foreground mt-1">Channel intelligence and analysis.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Users className="h-5 w-5" /> Channel Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Channel intelligence coming in Phase 5.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
