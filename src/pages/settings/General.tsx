import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function General() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">General Settings</h1>
        <p className="text-muted-foreground mt-1">Application configuration.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Settings className="h-5 w-5" /> Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            General settings coming in Phase 10.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
