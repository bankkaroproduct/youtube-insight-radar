import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { checkIpAccess } from "@/hooks/useIpWhitelist";
import { Shield } from "lucide-react";
import Auth from "@/pages/Auth";
import Index from "@/pages/Index";
import Keywords from "@/pages/Keywords";
import KeywordTable from "@/pages/KeywordTable";
import Videos from "@/pages/Videos";
import Channels from "@/pages/Channels";
import Links from "@/pages/Links";
import UserManagement from "@/pages/settings/UserManagement";
import ApiKeys from "@/pages/settings/ApiKeys";
import IpWhitelist from "@/pages/settings/IpWhitelist";
import General from "@/pages/settings/General";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function IpBlockedScreen({ ip }: { ip: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md p-8">
        <Shield className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground">
          Your IP address <span className="font-mono font-semibold">{ip}</span> is not authorized to access this application.
        </p>
        <p className="text-sm text-muted-foreground">
          Please contact your administrator to whitelist your IP address.
        </p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const [ipCheck, setIpCheck] = useState<{ checked: boolean; allowed: boolean; ip: string }>({
    checked: false, allowed: true, ip: "",
  });

  useEffect(() => {
    if (session) {
      checkIpAccess().then((res) => {
        setIpCheck({ checked: true, allowed: res.allowed, ip: res.ip });
      });
    }
  }, [session]);

  if (isLoading) return null;
  if (!session) return <Navigate to="/auth" replace />;
  if (!ipCheck.checked) return null;
  if (!ipCheck.allowed) return <IpBlockedScreen ip={ipCheck.ip} />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="/keywords" element={<ProtectedRoute><Keywords /></ProtectedRoute>} />
      <Route path="/keyword-table" element={<ProtectedRoute><KeywordTable /></ProtectedRoute>} />
      <Route path="/videos" element={<ProtectedRoute><Videos /></ProtectedRoute>} />
      <Route path="/channels" element={<ProtectedRoute><Channels /></ProtectedRoute>} />
      <Route path="/links" element={<ProtectedRoute><Links /></ProtectedRoute>} />
      <Route path="/settings/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
      <Route path="/settings/api-keys" element={<ProtectedRoute><ApiKeys /></ProtectedRoute>} />
      <Route path="/settings/ip-whitelist" element={<ProtectedRoute><IpWhitelist /></ProtectedRoute>} />
      <Route path="/settings/general" element={<ProtectedRoute><General /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
