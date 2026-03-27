import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks } from "lucide-react";

export default function Tasks() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Tasks</h1>
        <p className="text-muted-foreground mt-1">CRM task management and tracking.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <ListChecks className="h-5 w-5" /> Task Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Task management coming in Phase 7.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
