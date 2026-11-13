import React, { useState } from "react";
import { Image as ImageIcon, Play } from "lucide-react";
import { mediaProxyUrl } from "@/lib/monitorSituationFeed";

// Photos and clips attached to a report's sources. Nothing renders when a
// report carries no media at all.
export default function LiveReportMedia({ media = [], color = "#a855f7" }) {
  const [active, setActive] = useState(null);

  if (!media.length) return null;

  return (
    <section className="space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 flex items-center gap-1.5">
        <ImageIcon className="w-3 h-3" style={{ color }} /> מדיה ({media.length})
      </p>

      {active && (
        <div className="rounded-md overflow-hidden border border-white/10 bg-black/50">
          {active.type === "photo" ? (
            <img
              src={mediaProxyUrl(active.url)}
              onError={(e) => { e.currentTarget.src = active.url; }}
              alt={active.sourceName || ""}
              className="w-full max-h-[45vh] object-contain"
            />
          ) : (
            <video
              src={mediaProxyUrl(active.url)}
              poster={active.thumbnail ? mediaProxyUrl(active.thumbnail) : undefined}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[45vh] bg-black"
            />
          )}
          {active.sourceName && (
            <p className="px-2 py-1 text-[10px] font-mono text-white/40" dir="auto">{active.sourceName}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {media.map((m, i) => (
          <button
            key={`${m.url}-${i}`}
            onClick={() => setActive(m)}
            className={`relative aspect-video rounded-md overflow-hidden border transition-all ${
              active && active.url === m.url ? "border-primary" : "border-white/10 hover:border-white/30"
            }`}
          >
            <img
              src={mediaProxyUrl(m.thumbnail || (m.type === "photo" ? m.url : ""))}
              onError={(e) => { if (m.type === "photo") e.currentTarget.src = m.url; }}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
            {m.type !== "photo" && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Play className="w-4 h-4 text-white" />
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
