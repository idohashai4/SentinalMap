import React, { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/api/base44Client";

const cache = new Map();

async function loadVideos(id) {
  if (cache.has(id)) return cache.get(id);
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api/x-video?id=${id}`, {
    headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `failed (${res.status})`);
  cache.set(id, body.videos || []);
  return body.videos || [];
}

const escapeAttr = (v) => String(v || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// X refuses to serve its video files to pages that send a referrer, so the
// player sits in a small frame of its own that sends none.
function playerDoc(video) {
  const loop = video.gif ? " autoplay loop muted" : "";
  return `<!doctype html><meta name="referrer" content="no-referrer">
<style>html,body{margin:0;height:100%;background:#000}video{display:block;width:100%;height:100%;object-fit:contain}</style>
<video controls playsinline preload="metadata"${loop} poster="${escapeAttr(video.poster)}" src="${escapeAttr(video.src)}"></video>`;
}

// Only the video of an X post, without the post around it.
export default function XVideo({ id, href, title }) {
  const [state, setState] = useState({ loading: true, videos: [], error: "" });

  useEffect(() => {
    let alive = true;
    loadVideos(id)
      .then((videos) => alive && setState({ loading: false, videos, error: "" }))
      .catch((e) => alive && setState({ loading: false, videos: [], error: e.message }));
    return () => { alive = false; };
  }, [id]);

  if (state.loading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-[11px] font-mono text-white/40">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> טוען סרטון...
      </div>
    );
  }

  if (!state.videos.length) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300">
        <ExternalLink className="w-3 h-3 shrink-0" />
        {state.error ? "לא ניתן לטעון את הסרטון — פתח ב-X" : "בפוסט הזה אין סרטון — פתח ב-X"}
      </a>
    );
  }

  return (
    <div className="space-y-1.5">
      {state.videos.map((v, i) => (
        <iframe
          key={v.src}
          srcDoc={playerDoc(v)}
          title={title || `סרטון ${i + 1}`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="w-full rounded border border-white/10 bg-black"
          style={{ aspectRatio: `${v.width} / ${v.height}`, maxHeight: "60vh" }}
        />
      ))}
    </div>
  );
}
