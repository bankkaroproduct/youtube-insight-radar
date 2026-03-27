import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link as LinkIcon } from "lucide-react";

export default function Links() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Links</h1>
        <p className="text-muted-foreground mt-1">Affiliate link processing pipeline.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <LinkIcon className="h-5 w-5" /> Link Processing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Link processing coming in Phase 6.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
