import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Video, Users, Link } from "lucide-react";

const stats = [
  { title: "Keywords", value: "0", icon: Search, description: "Active keywords tracked" },
  { title: "Videos", value: "0", icon: Video, description: "Videos discovered" },
  { title: "Channels", value: "0", icon: Users, description: "Channels analyzed" },
  { title: "Links", value: "0", icon: Link, description: "Links processed" },
];

export default function Index() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your competitor intelligence pipeline.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-display font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Affiliate Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              Charts will appear once data is collected.
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              No recent activity yet.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
