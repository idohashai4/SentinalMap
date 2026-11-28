// A copy of the map's data kept in this browser, so the map opens straight
// away on the next visit and then refreshes in the background, instead of
// waiting for the server first. Kept per user and cleared on sign-out.

const PREFIX = "sentinel-cache:v1:";
// The lists the dashboard loads on start.
export const CACHED_QUERIES = ["points_of_interest", "poi_topics", "map_shapes", "place_labels"];

const key = (userId, name) => `${PREFIX}${userId}:${name}`;

export function readCache(userId, name) {
  try {
    const raw = localStorage.getItem(key(userId, name));
    return raw ? JSON.parse(raw) : undefined;
  } catch (e) {
    return undefined;
  }
}

export function writeCache(userId, name, value) {
  try {
    localStorage.setItem(key(userId, name), JSON.stringify(value));
  } catch (e) {
    // Storage full or blocked: the site simply loads from the server next time.
  }
}

export function clearCache() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}

// Seeds the query cache from the stored copy (marked stale, so it is refreshed
// right away), and keeps the stored copy up to date with every fresh result.
export function connectQueryCache(queryClient, userId) {
  for (const name of CACHED_QUERIES) {
    const cached = readCache(userId, name);
    if (cached !== undefined && queryClient.getQueryData([name]) === undefined) {
      queryClient.setQueryData([name], cached, { updatedAt: 1 });
    }
  }
  const pending = new Map();
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    const name = event?.query?.queryKey?.[0];
    if (event.type !== "updated" || event.query.queryKey.length !== 1 || !CACHED_QUERIES.includes(name)) return;
    if (event.query.state.status !== "success") return;
    // Several updates in a row (a fetch, then live changes) are written once.
    clearTimeout(pending.get(name));
    pending.set(name, setTimeout(() => writeCache(userId, name, event.query.state.data), 800));
  });
  return () => {
    unsubscribe();
    pending.forEach((t) => clearTimeout(t));
  };
}

// The last answer to "is this account allowed in", so the map does not wait for it.
export const readAllowed = (userId) => {
  try { return localStorage.getItem(`${PREFIX}${userId}:allowed`) === "1"; } catch (e) { return false; }
};
export const writeAllowed = (userId, allowed) => {
  try { localStorage.setItem(`${PREFIX}${userId}:allowed`, allowed ? "1" : "0"); } catch (e) {}
};
