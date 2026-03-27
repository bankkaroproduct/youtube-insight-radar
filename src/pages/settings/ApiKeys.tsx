import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound } from "lucide-react";

export default function ApiKeys() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">API Keys</h1>
        <p className="text-muted-foreground mt-1">Manage API keys and quota tracking.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> API Key Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            API key management coming in Phase 10.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
