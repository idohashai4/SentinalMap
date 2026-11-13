// Drop-in replacement for the Base44 SDK client, backed by Supabase.
// The app keeps calling `base44.entities.<table>.list(...)` etc. unchanged.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);
export const supabase = createClient(url || "http://localhost", anonKey || "missing");

function fail(error) {
  if (error) throw new Error(error.message || String(error));
}

// Base44 returned plain arrays in some SDK versions and `{ items }` in others;
// the app reads both, so hand back an array that also exposes `.items`.
function asList(rows) {
  const list = rows || [];
  Object.defineProperty(list, "items", { value: list, enumerable: false });
  return list;
}

function applySort(query, sort) {
  if (!sort) return query;
  const desc = sort.startsWith("-");
  return query.order(desc ? sort.slice(1) : sort, { ascending: !desc, nullsFirst: false });
}

function applyWhere(query, where = {}) {
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === "object" && !Array.isArray(value) && "$in" in value) query = query.in(key, value.$in);
    else if (value === null) query = query.is(key, null);
    else query = query.eq(key, value);
  }
  return query;
}

// filter(where, "-created_date", 100) and filter(where, { sort, limit }) are both in use.
function readOptions(sortOrOptions, limit) {
  if (sortOrOptions && typeof sortOrOptions === "object") return sortOrOptions;
  return { sort: sortOrOptions, limit };
}

function entity(table) {
  return {
    async list(sort = "-created_date", limit = 1000) {
      const { data, error } = await applySort(supabase.from(table).select("*"), sort).limit(limit);
      fail(error);
      return asList(data);
    },
    async filter(where, sortOrOptions, limit) {
      const opts = readOptions(sortOrOptions, limit);
      let q = applySort(applyWhere(supabase.from(table).select("*"), where), opts.sort || "-created_date");
      const { data, error } = await q.limit(opts.limit || 1000);
      fail(error);
      return asList(data);
    },
    async get(id) {
      const { data, error } = await supabase.from(table).select("*").eq("id", id).single();
      fail(error);
      return data;
    },
    async create(values) {
      const { data, error } = await supabase.from(table).insert(values).select().single();
      fail(error);
      return data;
    },
    async bulkCreate(rows) {
      const { data, error } = await supabase.from(table).insert(rows).select();
      fail(error);
      return data;
    },
    async update(id, values) {
      const { data, error } = await supabase.from(table).update(values).eq("id", id).select().single();
      fail(error);
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      fail(error);
      return { success: true };
    },
    // updateMany({ topic: "a" }, { $set: { topic: "b" } })
    async updateMany(where, change) {
      if (!where || !Object.keys(where).length) throw new Error("updateMany requires a filter");
      const { error } = await applyWhere(supabase.from(table).update(change.$set || change), where);
      fail(error);
      return { success: true };
    },
    async deleteMany(where) {
      if (!where || !Object.keys(where).length) throw new Error("deleteMany requires a filter");
      const { error } = await applyWhere(supabase.from(table).delete(), where);
      fail(error);
      return { success: true };
    },
  };
}

// AI runs in the app's own Vercel function (api/llm.js) on Vercel AI Gateway.
// The signed-in user's token goes along so the function can refuse everyone else.
async function invokeLLM({ file_urls = [], ...params }) {
  const { data } = await supabase.auth.getSession();
  // Screenshots arrive as data URLs (see UploadPrivateFile) and are sent inline.
  const images = file_urls
    .map((u) => /^data:([^;]+);base64,(.+)$/.exec(u))
    .filter(Boolean)
    .map((m) => ({ media_type: m[1], data: m[2] }));
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` },
    body: JSON.stringify({ ...params, images, file_urls: file_urls.filter((u) => !u.startsWith("data:")) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `AI request failed (${res.status})`);
  return body.result;
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const base44 = {
  entities: new Proxy({}, { get: (cache, table) => (cache[table] ||= entity(table)) }),

  integrations: {
    Core: {
      InvokeLLM: invokeLLM,
      // Map screenshots are only ever handed to the AI call, so they stay in
      // memory as a data URL instead of being stored anywhere.
      UploadPrivateFile: async ({ file }) => ({ file_uri: await toDataUrl(file) }),
      CreateFileSignedUrl: async ({ file_uri }) => ({ signed_url: file_uri }),
    },
  },
};

// Realtime: any change made by anyone is pushed to every open browser, which
// refreshes the matching react-query cache (query keys start with the table name).
const TABLES = ["points_of_interest", "poi_topics", "place_labels", "map_shapes", "layer_notes"];

export function subscribeToChanges(queryClient) {
  const channel = supabase.channel("db-changes");
  for (const table of TABLES) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      queryClient.invalidateQueries({ queryKey: [table] });
    });
  }
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}
