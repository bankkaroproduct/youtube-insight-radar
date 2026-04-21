import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Shield } from "lucide-react";
import Auth from "@/pages/Auth";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Index from "@/pages/Index";
import Keywords from "@/pages/Keywords";
import KeywordTable from "@/pages/KeywordTable";
import Videos from "@/pages/Videos";
import Channels from "@/pages/Channels";
import InstagramProfiles from "@/pages/InstagramProfiles";
import Links from "@/pages/Links";
import UserManagement from "@/pages/settings/UserManagement";
import ApiKeys from "@/pages/settings/ApiKeys";
import IpWhitelist from "@/pages/settings/IpWhitelist";
import AuditLog from "@/pages/settings/AuditLog";
import NotFound from "@/pages/NotFound";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

function IpBlockedScreen({ ip, error }: { ip: string; error?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md p-8">
        <Shield className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        {error ? (
          <p className="text-muted-foreground">
            Could not verify your IP — access blocked for safety. Contact your admin.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Your IP address <span className="font-mono font-semibold">{ip}</span> is not authorized to access this application.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Please contact your administrator to whitelist your IP address.
        </p>
      </div>
    </div>
  );
}

function FullscreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading, ipCheck } = useAuth();

  if (isLoading) return <FullscreenLoader />;
  if (!session) return <Navigate to="/auth" replace />;
  if (!ipCheck.checked) return <FullscreenLoader />;
  if (!ipCheck.allowed) return <IpBlockedScreen ip={ipCheck.ip} error={ipCheck.error} />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="/keywords" element={<ProtectedRoute><Keywords /></ProtectedRoute>} />
      <Route path="/keyword-table" element={<ProtectedRoute><KeywordTable /></ProtectedRoute>} />
      <Route path="/videos" element={<ProtectedRoute><Videos /></ProtectedRoute>} />
      <Route path="/channels" element={<ProtectedRoute><Channels /></ProtectedRoute>} />
      <Route path="/instagram" element={<ProtectedRoute><InstagramProfiles /></ProtectedRoute>} />
      <Route path="/links" element={<ProtectedRoute><Links /></ProtectedRoute>} />
      <Route path="/settings/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
      <Route path="/settings/api-keys" element={<ProtectedRoute><ApiKeys /></ProtectedRoute>} />
      <Route path="/settings/ip-whitelist" element={<ProtectedRoute><IpWhitelist /></ProtectedRoute>} />
      <Route path="/settings/audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
