// Shared by the API functions (files starting with _ are not routes on Vercel).

// This is a private app: only a signed-in user on the allow-list may spend AI
// credits. The caller's Supabase token is checked by Supabase itself (an invalid
// token is rejected there), and is_allowed() answers for that user's email.
export async function isAllowedUser(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const auth = req.headers.authorization || "";
  if (!url || !anonKey || !auth.startsWith("Bearer ")) return false;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/is_allowed`, {
      method: "POST",
      // is_allowed() lives in the app's own schema, sentinel.
      headers: { apikey: anonKey, Authorization: auth, "Content-Type": "application/json", "Content-Profile": "sentinel" },
      body: "{}",
    });
    return r.ok && (await r.json()) === true;
  } catch {
    return false;
  }
}
