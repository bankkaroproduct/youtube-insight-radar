import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { checkIpAccess } from "@/hooks/useIpWhitelist";
import { toast } from "sonner";

type AppRole = Database["public"]["Enums"]["app_role"];

interface IpCheckState {
  allowed: boolean;
  ip: string;
  error?: boolean;
  checked: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Database["public"]["Tables"]["user_profiles"]["Row"] | null;
  roles: AppRole[];
  isLoading: boolean;
  ipCheck: IpCheckState;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Database["public"]["Tables"]["user_profiles"]["Row"] | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ipCheck, setIpCheck] = useState<IpCheckState>({ allowed: true, ip: "", checked: false });
  const rolesRef = useRef<AppRole[]>([]);

  const loadUserData = async (userId: string) => {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("user_id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile(profileRes.data ?? null);
    const newRoles = rolesRes.data?.map((r) => r.role) ?? [];
    setRoles(newRoles);
    rolesRef.current = newRoles;
    return { profile: profileRes.data, roles: newRoles };
  };

  const runIpCheck = async (userRoles: AppRole[]) => {
    if (userRoles.includes("super_admin")) {
      setIpCheck({ checked: true, allowed: true, ip: "bypassed" });
      return;
    }
    const res = await checkIpAccess();
    setIpCheck({ checked: true, allowed: res.allowed, ip: res.ip, error: res.error });
  };

  useEffect(() => {
    let initialized = false;
    let lastUserId: string | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          const userChanged = newSession.user.id !== lastUserId;
          lastUserId = newSession.user.id;
          const { roles: newRoles } = await loadUserData(newSession.user.id);
          if (initialized && userChanged) {
            // Reset ip check on user switch and re-run.
            setIpCheck({ allowed: true, ip: "", checked: false });
            runIpCheck(newRoles);
          }
        } else {
          setProfile(null);
          setRoles([]);
          rolesRef.current = [];
          lastUserId = null;
          setIpCheck({ allowed: true, ip: "", checked: false });
        }
        if (initialized) setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        lastUserId = initialSession.user.id;
        const { roles: newRoles } = await loadUserData(initialSession.user.id);

        // Hard-enforce deactivated accounts
        const { data: prof } = await supabase
          .from("user_profiles")
          .select("is_active")
          .eq("user_id", initialSession.user.id)
          .single();
        if (prof && prof.is_active === false) {
          await supabase.auth.signOut();
          toast.error("Your account has been deactivated. Contact an admin.");
          initialized = true;
          setIsLoading(false);
          return;
        }

        await runIpCheck(newRoles);
      }
      initialized = true;
      setIsLoading(false);
    });

    // Poll every 5 minutes for role changes mid-session.
    const roleCheckInterval = setInterval(async () => {
      const currentSession = (await supabase.auth.getSession()).data.session;
      if (!currentSession?.user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", currentSession.user.id);
      const currentRoles = ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
      const prev = rolesRef.current;
      const hasChanged =
        currentRoles.length !== prev.length ||
        currentRoles.some((r) => !prev.includes(r));
      if (hasChanged) {
        rolesRef.current = currentRoles;
        setRoles(currentRoles);
        toast.info("Your permissions were updated. The page will refresh.");
        setTimeout(() => window.location.reload(), 2000);
      }
    }, 5 * 60_000);

    return () => {
      subscription.unsubscribe();
      clearInterval(roleCheckInterval);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin") || hasRole("super_admin");

  return (
    <AuthContext.Provider
      value={{ session, user, profile, roles, isLoading, ipCheck, signIn, signUp, signOut, hasRole, isAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
