import React, { useState } from "react";
import { ExternalLink, Radio } from "lucide-react";

const TYPE_LABEL = { news: "כתבה", twitter: "רשת חברתית", telegram: "טלגרם" };

// A report is usually built from several source reports — each one is listed
// here with its own text and a link to the original article or post.
export default function LiveReportSources({ sources = [] }) {
  const [openId, setOpenId] = useState(null);

  if (!sources.length) {
    return (
      <p className="text-center text-[11px] font-mono text-white/30 py-6">
        לא נמצאו מקורות לדיווח זה
      </p>
    );
  }

  return (
    <section className="space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 flex items-center gap-1.5">
        <Radio className="w-3 h-3" /> מקורות ({sources.length})
      </p>

      {sources.map((s, i) => {
        const long = (s.content || "").length > 220;
        const expanded = openId === s.id;
        return (
          <div key={s.id || i} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-white/30">{i + 1}</span>
              <span className="text-[11px] font-mono font-bold text-white/90 truncate" dir="auto">{s.sourceName}</span>
              {s.sourceType && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/15 text-white/50">
                  {TYPE_LABEL[s.sourceType] || s.sourceType}
                </span>
              )}
              {s.reliability > 0 && (
                <span className="mr-auto text-[9px] font-mono text-white/40">אמינות {s.reliability}/5</span>
              )}
            </div>

            {s.title && <p className="text-[11px] text-white/80 leading-snug" dir="auto">{s.title}</p>}

            {s.content && (
              <p
                className={`text-[11px] text-white/60 leading-relaxed whitespace-pre-line ${expanded ? "" : "line-clamp-4"}`}
                dir="auto"
              >
                {s.content}
              </p>
            )}

            <div className="flex items-center gap-3">
              {long && (
                <button
                  onClick={() => setOpenId(expanded ? null : s.id)}
                  className="text-[10px] font-mono text-primary hover:underline"
                >
                  {expanded ? "הצג פחות" : "הצג עוד"}
                </button>
              )}
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-auto flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> פתח מקור
              </a>
            </div>
          </div>
        );
      })}
    </section>
  );
}
