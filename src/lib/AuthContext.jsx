import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/api/base44Client";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // null = not checked yet. The database enforces the allow-list either way;
  // this only decides which screen to show.
  const [isAllowed, setIsAllowed] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoadingAuth(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    setIsAllowed(null);
    if (!userId) return;
    let cancelled = false;
    supabase.rpc("is_allowed").then(({ data }) => { if (!cancelled) setIsAllowed(data === true); });
    return () => { cancelled = true; };
  }, [userId]);

  const logout = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user: session?.user || null, isAuthenticated: !!session, isAllowed, isLoadingAuth: isLoadingAuth || (!!session && isAllowed === null), logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
