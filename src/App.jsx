import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { isConfigured, subscribeToChanges } from "@/api/base44Client";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, isAllowed, user, logout } = useAuth();

  // Live sync: changes saved from any browser show up here without a reload.
  useEffect(() => {
    if (!isAuthenticated || !isAllowed) return;
    return subscribeToChanges(queryClientInstance);
  }, [isAuthenticated, isAllowed]);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-slate-200 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;

  if (!isAllowed) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center font-mono" dir="rtl">
        <p className="text-sm text-foreground">לחשבון <span dir="ltr">{user?.email}</span> אין הרשאה לאתר הזה.</p>
        <button onClick={logout} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">
          התנתק
        </button>
      </div>
    );
  }

  return <Dashboard />;
};

function App() {
  if (!isConfigured) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6 text-center font-mono text-sm text-muted-foreground" dir="rtl">
        חסרים משתני הסביבה VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY. הגדר אותם ב-Vercel או בקובץ ‎.env ובנה מחדש.
      </div>
    );
  }

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <AuthenticatedApp />
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
