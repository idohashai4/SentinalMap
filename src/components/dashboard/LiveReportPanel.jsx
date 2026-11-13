import React from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { LIVE_COLORS, timeAgo } from "@/lib/liveFeeds";
import { fetchEventSignals } from "@/lib/monitorSituationFeed";
import LiveReportSources from "./LiveReportSources";
import LiveReportMedia from "./LiveReportMedia";

// Side panel for one live report: its summary, media and the source reports behind it.
export default function LiveReportPanel({ item, onClose }) {
  const color = LIVE_COLORS[item.group] || "#a855f7";
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["live_report_signals", item.eventId],
    queryFn: () => fetchEventSignals(item.eventId),
    enabled: !!item.eventId,
  });
  const media = sources.flatMap((s) => s.media || []);

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute top-0 right-0 h-full w-full max-w-[440px] bg-[#0f172a] border-l border-white/10 shadow-2xl flex flex-col">
        <div className="shrink-0 flex items-start gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
          <span className="w-2 h-2 mt-1.5 rotate-45 shrink-0" style={{ background: color }} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40" dir="auto">
              {item.sourceName}{item.time ? ` · ${timeAgo(item.time)}` : ""}
            </p>
            <h3 className="text-sm font-mono font-bold text-white leading-snug" dir="auto">{item.title}</h3>
          </div>
          <button onClick={onClose} aria-label="סגור" className="text-white/40 hover:text-white/80 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {item.detail && <p className="text-[11px] font-mono text-white/50" dir="auto">{item.detail}</p>}
          {item.summary && <p className="text-xs text-white/80 leading-relaxed" dir="auto">{item.summary}</p>}
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs font-mono text-white/40">
              <Loader2 className="w-4 h-4 animate-spin" /> טוען מקורות...
            </div>
          ) : (
            <>
              <LiveReportMedia media={media} color={color} />
              <LiveReportSources sources={sources} />
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
