import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Video, Users, Link, TrendingUp, Activity, ArrowUpRight } from "lucide-react";

const stats = [
  { title: "Keywords", value: "0", icon: Search, description: "Active keywords tracked", trend: "+0%", color: "bg-primary/10 text-primary" },
  { title: "Videos", value: "0", icon: Video, description: "Videos discovered", trend: "+0%", color: "bg-info/10 text-info" },
  { title: "Channels", value: "0", icon: Users, description: "Channels analyzed", trend: "+0%", color: "bg-success/10 text-success" },
  { title: "Links", value: "0", icon: Link, description: "Links processed", trend: "+0%", color: "bg-warning/10 text-warning" },
];

export default function Index() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your competitor intelligence pipeline.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
          <Activity className="h-3.5 w-3.5" />
          <span>Last updated: just now</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="group hover:shadow-md transition-all duration-200 border-border/60">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-success">
                <TrendingUp className="h-3 w-3" />
                {stat.trend}
              </span>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
              <p className="text-sm text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Affiliate Distribution</CardTitle>
            <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              View all <ArrowUpRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                <TrendingUp className="h-6 w-6" />
              </div>
              <p className="text-sm">Charts will appear once data is collected.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
            <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              View all <ArrowUpRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                <Activity className="h-6 w-6" />
              </div>
              <p className="text-sm">No recent activity yet.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
