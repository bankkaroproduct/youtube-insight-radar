import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";

export default function Keywords() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Keywords</h1>
          <p className="text-muted-foreground mt-1">Manage and track your keyword portfolio.</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Search className="h-5 w-5" /> Keyword Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Keyword management coming in Phase 3.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
