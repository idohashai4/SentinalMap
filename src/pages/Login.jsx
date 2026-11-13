import React, { useState } from "react";
import { Globe2, Loader2 } from "lucide-react";
import { supabase } from "@/api/base44Client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // Supabase emails a one-time sign-in link. The browser then stays signed in,
  // so this is needed once per device.
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: failure } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (failure) {
      // Show Supabase's own reason: it tells a wrong key from a blocked sign-up from a rate limit.
      setError(`השליחה נכשלה: ${failure.message || failure.status || "שגיאה לא ידועה"}`);
    } else {
      setSent(true);
    }
    setBusy(false);
  };

  const inputCls =
    "w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/60";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <form onSubmit={submit} className="w-full max-w-sm bg-card border border-border rounded-xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Globe2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold font-mono uppercase tracking-wider text-foreground">Sentinel Pulse</h1>
            <p className="text-xs text-muted-foreground font-mono">אתר פרטי · התחבר כדי להמשיך</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground leading-relaxed">
              שלחנו קישור כניסה אל <span dir="ltr" className="font-mono">{email.trim()}</span>. פתח את המייל ולחץ על הקישור.
            </p>
            <button type="button" onClick={() => setSent(false)}
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors">
              שלח שוב או החלף כתובת
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">אימייל</label>
              <input id="email" type="email" required autoComplete="email" dir="ltr" value={email}
                onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
            {error && <p className="text-xs font-mono text-red-400 break-words" dir="auto">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full h-10 rounded-md bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-mono font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} שלח לי קישור כניסה
            </button>
          </>
        )}
      </form>
    </div>
  );
}
