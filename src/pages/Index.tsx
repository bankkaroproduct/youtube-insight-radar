import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Video, Users, Link as LinkIcon, TrendingUp, Activity, ArrowUpRight, RefreshCw } from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const CLASSIFICATION_COLORS: Record<string, string> = {
  OWN: "hsl(var(--success))",
  COMPETITOR: "hsl(var(--destructive))",
  NEUTRAL: "hsl(var(--muted-foreground))",
};

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "completed") return "default";
  if (status === "failed" || status === "dead_letter") return "destructive";
  return "secondary";
};

export default function Index() {
  useEffect(() => { document.title = "Dashboard | YT Intel"; }, []);
  const { counts, recent, affiliates, isLoading, lastUpdated, error, refresh } = useDashboard();
  const navigate = useNavigate();

  const stats = [
    { title: "Keywords", value: counts.keywords, icon: Search, description: "Active keywords tracked", color: "bg-primary/10 text-primary" },
    { title: "Videos", value: counts.videos, icon: Video, description: "Videos discovered", color: "bg-info/10 text-info" },
    { title: "Channels", value: counts.channels, icon: Users, description: "Channels analyzed", color: "bg-success/10 text-success" },
    { title: "Links", value: counts.links, icon: LinkIcon, description: "Links processed", color: "bg-warning/10 text-warning" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your competitor intelligence pipeline.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
            <Activity className="h-3.5 w-3.5" />
            <span>
              {lastUpdated ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}` : "Loading…"}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={refresh} disabled={isLoading} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-4 py-3 text-sm">
          {error}. Some widgets may show partial data.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="group hover:shadow-md transition-all duration-200 border-border/60">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold tracking-tight">{stat.value.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Affiliate Distribution</CardTitle>
            <button
              onClick={() => navigate("/keyword-table")}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent>
            {affiliates.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <p className="text-sm">Charts will appear once data is collected.</p>
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={affiliates}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      innerRadius={40}
                      paddingAngle={2}
                    >
                      {affiliates.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={CLASSIFICATION_COLORS[entry.name] ?? "hsl(var(--muted-foreground))"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.5rem",
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
            <button
              onClick={() => navigate("/keywords")}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <Activity className="h-6 w-6" />
                </div>
                <p className="text-sm">No recent activity yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {recent.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => navigate("/keywords")}
                    className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-muted/50 rounded-md px-2 -mx-2 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{job.keyword}</div>
                      <div className="text-xs text-muted-foreground">
                        {job.videos_found ?? 0} videos
                        {job.completed_at && ` · ${formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}`}
                      </div>
                    </div>
                    <Badge variant={statusVariant(job.status)} className="shrink-0">
                      {job.status}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
