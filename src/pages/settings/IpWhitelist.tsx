import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function IpWhitelist() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">IP Whitelist</h1>
        <p className="text-muted-foreground mt-1">Manage IP access control.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Shield className="h-5 w-5" /> IP Whitelist Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            IP whitelist management coming in Phase 10.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
