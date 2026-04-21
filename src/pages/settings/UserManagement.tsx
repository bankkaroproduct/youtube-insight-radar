import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { UserCog } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type Profile = Database["public"]["Tables"]["user_profiles"]["Row"];

interface UserWithRole extends Profile {
  roles: AppRole[];
}

export default function UserManagement() {
  const { isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("user_profiles").select("*");
    const { data: roles } = await supabase.from("user_roles").select("*");

    if (profiles) {
      const mapped = profiles.map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.user_id).map((r) => r.role),
      }));
      setUsers(mapped);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  const updateRole = async (userId: string, _currentRoles: AppRole[], newRole: AppRole) => {
    const { error } = await supabase.rpc("replace_user_role", {
      _target_user_id: userId,
      _new_role: newRole,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Role updated" });
      fetchUsers();
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        You don't have permission to access this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">User Management</h1>
        <p className="text-muted-foreground mt-1">Manage users and assign roles.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <UserCog className="h-5 w-5" /> Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {currentUser?.id === user.user_id ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-block">
                                <Select value={user.roles[0] || "viewer"} disabled>
                                  <SelectTrigger className="w-36" disabled>
                                    <SelectValue />
                                  </SelectTrigger>
                                </Select>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>You cannot change your own role</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Select
                          value={user.roles[0] || "viewer"}
                          onValueChange={(v) => updateRole(user.user_id, user.roles, v as AppRole)}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Constants.public.Enums.app_role.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? "default" : "secondary"}>
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
