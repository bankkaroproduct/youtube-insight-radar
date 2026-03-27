import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video } from "lucide-react";

export default function Videos() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Videos</h1>
        <p className="text-muted-foreground mt-1">Discover and analyze YouTube videos.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Video className="h-5 w-5" /> Video Discovery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Video discovery coming in Phase 4.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
