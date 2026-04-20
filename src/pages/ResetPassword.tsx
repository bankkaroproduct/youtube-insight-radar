import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Youtube, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase parses recovery tokens from the URL hash automatically and emits a
    // PASSWORD_RECOVERY event. We listen for either that or an existing session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setError(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      } else {
        // Give Supabase a brief moment to process the hash on initial load
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: d2 }) => {
            if (!d2.session) {
              setError(
                "This reset link is invalid or has expired. Please request a new one from the forgot password page."
              );
            }
          });
        }, 800);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please re-enter your new password.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updErr) {
      toast({ title: "Could not update password", description: updErr.message, variant: "destructive" });
      return;
    }
    toast({ title: "Password updated", description: "Sign in with your new password." });
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center">
            <Youtube className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-foreground">YT Intel</span>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">Set a new password</h2>
          <p className="text-muted-foreground mt-1">Choose a strong password you haven't used before.</p>
        </div>

        {error ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
              {error}
            </div>
            <Button onClick={() => navigate("/forgot-password")} className="w-full h-11 font-semibold text-sm">
              Request new reset link
            </Button>
          </div>
        ) : !ready ? (
          <div className="text-sm text-muted-foreground">Verifying reset link…</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-medium">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPw ? "text" : "password"}
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm new password</Label>
              <Input
                id="confirm-password"
                type={showPw ? "text" : "password"}
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11 font-semibold text-sm" disabled={submitting}>
              {submitting ? "Updating..." : (
                <span className="flex items-center gap-2">Update password <ArrowRight className="h-4 w-4" /></span>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
