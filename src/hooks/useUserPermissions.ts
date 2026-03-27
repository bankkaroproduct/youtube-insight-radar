import { useAuth } from "@/hooks/useAuth";

export function useUserPermissions() {
  const { isAdmin, hasRole } = useAuth();
  
  const canEdit = isAdmin || hasRole("manager");
  const canExport = isAdmin || hasRole("manager") || hasRole("analyst");
  const canView = true;

  return { canEdit, canExport, canView };
}
