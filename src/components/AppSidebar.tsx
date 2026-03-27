import {
  Youtube,
  Search,
  Video,
  Users,
  Link,
  BarChart3,
  Settings,
  LogOut,
  ListChecks,
  Zap,
  KeyRound,
  Shield,
  UserCog,
  LayoutDashboard,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const discoveryItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Keywords", url: "/keywords", icon: Search },
  { title: "Videos", url: "/videos", icon: Video },
];

const intelligenceItems = [
  { title: "Channels", url: "/channels", icon: Users },
  { title: "Links", url: "/links", icon: Link },
];

const crmItems = [
  { title: "Tasks", url: "/tasks", icon: ListChecks },
  { title: "Triggers", url: "/triggers", icon: Zap },
];

const settingsItems = [
  { title: "User Management", url: "/settings/users", icon: UserCog, adminOnly: true },
  { title: "API Keys", url: "/settings/api-keys", icon: KeyRound, adminOnly: true },
  { title: "IP Whitelist", url: "/settings/ip-whitelist", icon: Shield, adminOnly: true },
  { title: "General", url: "/settings/general", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, profile, isAdmin } = useAuth();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const renderGroup = (
    label: string,
    items: typeof discoveryItems,
  ) => (
    <SidebarGroup>
      <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-xs tracking-wider">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items
            .filter((item) => !("adminOnly" in item) || !item.adminOnly || isAdmin)
            .map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive(item.url)}>
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    className="hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Youtube className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-bold text-lg text-sidebar-foreground tracking-tight">
              YT Intel
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Discovery", discoveryItems)}
        {renderGroup("Intelligence", intelligenceItems)}
        {renderGroup("CRM", crmItems)}
        {renderGroup("Settings", settingsItems)}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && profile && (
          <p className="text-xs text-sidebar-foreground/60 truncate mb-2 px-2">
            {profile.email}
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
