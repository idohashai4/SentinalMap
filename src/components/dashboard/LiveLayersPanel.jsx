import React, { useState } from "react";
import { Radio, RefreshCw, Loader2, Search } from "lucide-react";
import { LIVE_GROUPS, timeAgo } from "@/lib/liveFeeds";
import PanelSection from "./PanelSection";
import LiveLayerList from "./LiveLayerList";

// Live external feeds: switch a feed on to load it onto the map and into the list.
export default function LiveLayersPanel({ live, savedIds = [], onFocus, onSave, onUnsave, onDetails }) {
  const [areas, setAreas] = useState({});

  return (
    <PanelSection icon={Radio} title="שכבות חיות" accent="chart4" bodyClassName="p-2.5 space-y-2">
      {LIVE_GROUPS.map((group) => {
        const on = live.enabled[group.id];
        const loading = live.loading[group.id];
        const area = areas[group.id] || "";
        const items = live.items[group.id] || [];
        return (
          <div key={group.id} className={`rounded-md border transition-all ${on ? "border-primary/30 bg-primary/5" : "border-border/50 bg-muted/20"}`}>
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <button
                role="switch"
                aria-checked={on}
                aria-label={group.label}
                onClick={() => live.toggle(group.id, area)}
                className={`relative w-8 h-4 rounded-full shrink-0 transition-colors ${on ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
              </button>
              <span className="w-2 h-2 rotate-45 shrink-0" style={{ background: group.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-mono font-semibold text-foreground truncate">{group.label}</p>
                <p className="text-[10px] font-mono text-foreground/60 truncate">{group.source} · {group.hint}</p>
              </div>
              {on && (
                <>
                  <span className="text-[10px] font-mono font-semibold text-foreground/75">{items.length}</span>
                  <button onClick={() => live.refresh(group.id, area)} disabled={loading} title="רענן"
                    className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  </button>
                </>
              )}
            </div>

            {on && (
              <div className="px-2.5 pb-2 space-y-1.5">
                {group.searchable && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); live.refresh(group.id, area); }}
                    className="flex gap-1"
                  >
                    <input
                      value={area}
                      onChange={(e) => setAreas((p) => ({ ...p, [group.id]: e.target.value }))}
                      placeholder="סינון לפי מדינה, אזור או מילת מפתח (באנגלית)..."
                      className="flex-1 min-w-0 bg-muted/40 border border-border rounded-md px-2 py-1 text-[10px] font-mono text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary/50"
                      dir="auto"
                    />
                    <button type="submit" aria-label="חפש" className="px-2 rounded-md bg-muted/60 hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-all">
                      <Search className="w-3 h-3" />
                    </button>
                  </form>
                )}
                {group.filterHint && <p className="text-[9px] font-mono text-foreground/50">{group.filterHint}</p>}
                {live.error[group.id] && <p className="text-[10px] font-mono text-red-400">{live.error[group.id]}</p>}
                {live.updatedAt[group.id] && !loading && (
                  <p className="text-[9px] font-mono text-foreground/50">עודכן {timeAgo(live.updatedAt[group.id])} · מתרענן אוטומטית כל 5 דקות</p>
                )}
                {loading && items.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-[10px] font-mono text-foreground/60 py-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> טוען...
                  </p>
                ) : (
                  <LiveLayerList items={items} savedIds={savedIds} onFocus={onFocus} onSave={onSave} onUnsave={onUnsave} onDetails={onDetails} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </PanelSection>
  );
}
