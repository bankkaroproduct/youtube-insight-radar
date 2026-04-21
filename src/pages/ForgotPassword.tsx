import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Youtube, ArrowRight, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  useEffect(() => { document.title = "Forgot Password | YT Intel"; }, []);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Something went wrong", { description: error.message });
      return;
    }
    setSent(true);
    toast.success("Check your inbox", {
      description: "If an account exists for this email, a reset link has been sent.",
    });
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
          <h2 className="text-2xl font-bold text-foreground">Forgot your password?</h2>
          <p className="text-muted-foreground mt-1">
            Enter your email and we'll send you a link to reset it.
          </p>
        </div>

        {sent ? (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, a
              reset link has been sent. Check your inbox (and spam folder).
            </div>
            <Link to="/auth">
              <Button variant="outline" className="w-full h-11 font-semibold text-sm">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to sign in
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11 font-semibold text-sm" disabled={submitting}>
              {submitting ? "Sending..." : (
                <span className="flex items-center gap-2">Send reset link <ArrowRight className="h-4 w-4" /></span>
              )}
            </Button>
            <Link to="/auth" className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
