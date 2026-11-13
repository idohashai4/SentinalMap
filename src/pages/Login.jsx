import React, { useState } from "react";
import { Globe2, Loader2 } from "lucide-react";
import { supabase } from "@/api/base44Client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const signInWithGoogle = async () => {
    setBusy(true);
    setError("");
    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (failure) {
      setError("ההתחברות עם Google נכשלה. נסה שוב.");
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (failure) setError("ההתחברות נכשלה. בדוק את האימייל והסיסמה.");
    setBusy(false);
  };

  const inputCls =
    "w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/60";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Globe2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold font-mono uppercase tracking-wider text-foreground">Sentinel Pulse</h1>
            <p className="text-xs text-muted-foreground font-mono">אתר פרטי · התחבר כדי להמשיך</p>
          </div>
        </div>

        <button type="button" onClick={signInWithGoogle} disabled={busy}
          className="w-full h-10 rounded-md bg-white hover:bg-white/90 disabled:opacity-50 text-slate-900 text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors">
          {busy && !showPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
            </svg>
          )}
          התחבר עם Google
        </button>

        {error && <p className="text-xs font-mono text-red-400">{error}</p>}

        {!showPassword ? (
          <button type="button" onClick={() => setShowPassword(true)}
            className="w-full text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors">
            התחברות עם אימייל וסיסמה
          </button>
        ) : (
          <form onSubmit={submit} className="space-y-3 pt-3 border-t border-border">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">אימייל</label>
              <input id="email" type="email" required autoComplete="email" dir="ltr" value={email}
                onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">סיסמה</label>
              <input id="password" type="password" required autoComplete="current-password" dir="ltr" value={password}
                onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </div>
            <button type="submit" disabled={busy}
              className="w-full h-10 rounded-md bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-mono font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} התחבר
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
