import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Youtube, ArrowRight, Eye, EyeOff, MailCheck } from "lucide-react";

export default function Auth() {
  const { session, isLoading } = useAuth();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [signupSent, setSignupSent] = useState(false);
  const [resending, setResending] = useState(false);
  const { signIn, signUp } = useAuth();

  if (isLoading) return null;
  if (session) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(loginEmail, loginPassword);
    if (error) toast.error("Login failed", { description: error.message });
    setSubmitting(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName);
    if (error) {
      toast.error("Signup failed", { description: error.message });
    } else {
      setSignupSent(true);
    }
    setSubmitting(false);
  };

  const handleResend = async () => {
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: signupEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    if (error) {
      toast.error("Resend failed", { description: error.message });
    } else {
      toast.success("Confirmation email sent", { description: `Check your inbox at ${signupEmail}.` });
    }
    setResending(false);
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-destructive opacity-90" />
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(0 0% 100% / 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(0 0% 100% / 0.08) 0%, transparent 40%)',
        }} />
        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-14 w-14 rounded-2xl bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center border border-primary-foreground/10">
              <Youtube className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold text-primary-foreground tracking-tight">YT Intel</h1>
          </div>
          <p className="text-xl text-primary-foreground/90 font-medium leading-relaxed mb-6">
            Competitor Intelligence & Affiliate Tracking for YouTube
          </p>
          <p className="text-primary-foreground/60 leading-relaxed">
            Track keywords, discover videos, analyze channels, and monitor affiliate links — all in one powerful platform.
          </p>
          <div className="mt-12 grid grid-cols-2 gap-4">
            {[
              { label: "Keywords", desc: "Track & discover" },
              { label: "Videos", desc: "Auto-categorize" },
              { label: "Channels", desc: "Deep analysis" },
              { label: "Links", desc: "Affiliate tracking" },
            ].map((f) => (
              <div key={f.label} className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-4 border border-primary-foreground/10">
                <p className="text-primary-foreground font-semibold text-sm">{f.label}</p>
                <p className="text-primary-foreground/50 text-xs mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - Auth form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center">
              <Youtube className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">YT Intel</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
            <p className="text-muted-foreground mt-1">Sign in to your account to continue</p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 h-11 bg-muted">
              <TabsTrigger value="login" className="font-medium">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="font-medium">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm font-medium">Email address</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password" className="text-sm font-medium">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showLoginPw ? "text" : "password"}
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPw(!showLoginPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showLoginPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 font-semibold text-sm" disabled={submitting}>
                  {submitting ? "Signing in..." : (
                    <span className="flex items-center gap-2">Sign In <ArrowRight className="h-4 w-4" /></span>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              {signupSent ? (
                <div className="rounded-xl border bg-card p-6 text-center space-y-4">
                  <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <MailCheck className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-foreground">Check your inbox</h3>
                    <p className="text-sm text-muted-foreground">
                      We sent a confirmation link to <span className="font-medium text-foreground">{signupEmail}</span>.
                      Click it to activate your account.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button onClick={handleResend} variant="outline" disabled={resending} className="w-full">
                      {resending ? "Resending..." : "Resend confirmation email"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        setSignupSent(false);
                        setSignupEmail("");
                        setSignupPassword("");
                        setSignupName("");
                      }}
                    >
                      Use a different email
                    </Button>
                  </div>
                </div>
              ) : (
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-sm font-medium">Full Name</Label>
                  <Input
                    id="signup-name"
                    placeholder="John Doe"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm font-medium">Email address</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showSignupPw ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      minLength={6}
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPw(!showSignupPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSignupPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 font-semibold text-sm" disabled={submitting}>
                  {submitting ? "Creating account..." : (
                    <span className="flex items-center gap-2">Create Account <ArrowRight className="h-4 w-4" /></span>
                  )}
                </Button>
              </form>
              )}
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground text-center mt-8">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
