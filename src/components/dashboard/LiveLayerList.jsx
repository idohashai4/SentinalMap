import React from "react";
import { Bookmark, BookmarkCheck, Crosshair, ExternalLink, Info } from "lucide-react";
import { LIVE_COLORS, timeAgo } from "@/lib/liveFeeds";
import { fetchEventSourceUrl } from "@/lib/monitorSituationFeed";

// Opens the report's own source article; live reports resolve it on demand.
async function openSource(item) {
  if (item.sourceUrl) {
    window.open(item.sourceUrl, "_blank", "noopener,noreferrer");
    return;
  }
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  const url = (await fetchEventSourceUrl(item.eventId).catch(() => null))?.url;
  if (url && tab) tab.location.replace(url);
  else if (tab) tab.close();
}

export default function LiveLayerList({ items = [], savedIds = [], onFocus, onSave, onUnsave, onDetails }) {
  if (items.length === 0) {
    return (
      <p className="text-[10px] font-mono text-foreground/60 italic px-1 py-1">
        אין פריטים חיים להצגה
      </p>
    );
  }

  return (
    <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5">
      {items.map((item) => {
        const color = LIVE_COLORS[item.group] || "#a855f7";
        const saved = savedIds.includes(item.id);
        const located = typeof item.lat === "number" && typeof item.lon === "number";
        return (
          <div key={item.id} className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 space-y-1">
            <div className="flex items-start gap-1.5">
              <span className="w-1.5 h-1.5 mt-1.5 shrink-0 rotate-45" style={{ background: color }} />
              <p className="flex-1 text-[11px] font-mono text-foreground leading-snug" dir="auto">
                {item.title}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-foreground/70">
              <span dir="auto">{item.sourceName}</span>
              {item.time && <span>· {timeAgo(item.time)}</span>}
              <span className="ml-auto flex items-center gap-1.5">
                {item.eventId && onDetails &&
                <button
                  onClick={() => onDetails(item)}
                  title="מקורות ומדיה"
                  className="hover:text-primary transition-colors"
                >
                  <Info className="w-3 h-3" />
                </button>
                }
                {(item.sourceUrl || item.eventId) &&
                <button
                  onClick={() => openSource(item)}
                  title="פתח את המקור"
                  className="hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
                }
                <button
                  onClick={() => onFocus && onFocus(item)}
                  disabled={!located}
                  title={located ? "מיקוד במפה" : "אין מיקום מדויק לדיווח זה"}
                  className="hover:text-primary transition-colors disabled:opacity-25 disabled:hover:text-muted-foreground/60"
                >
                  <Crosshair className="w-3 h-3" />
                </button>
                <button
                  onClick={() => saved ? onUnsave && onUnsave(item) : onSave && onSave(item)}
                  disabled={!located}
                  title={!located ? "אין מיקום מדויק לדיווח זה" : saved ? "הסר את נקודת המחקר" : "שמור כנקודת מחקר"}
                  className={saved ? "text-green-400 hover:text-red-400 transition-colors" : "hover:text-primary transition-colors"}
                >
                  {saved ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
                </button>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

