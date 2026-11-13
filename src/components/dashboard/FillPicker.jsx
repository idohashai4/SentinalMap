import React, { useState } from "react";
import { Flag, Palette } from "lucide-react";
import { FLAGS, flagLabel, flagUrl } from "@/lib/flags";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#e2e8f0"
];

// Shape fill selector: solid color or a flag (kept semi-transparent by the shape opacity).
export default function FillPicker({ fillType = "color", flag = null, color = "#3b82f6", onChange }) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const results = q ? FLAGS.filter((f) => f.label.includes(q) || f.id === q.toLowerCase()) : FLAGS;

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[
          { id: "color", label: "Color", icon: <Palette className="w-3.5 h-3.5" /> },
          { id: "flag", label: "Flag", icon: <Flag className="w-3.5 h-3.5" /> },
        ].map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ fillType: id })}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-xs font-mono transition-colors ${
              fillType === id
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {fillType === "color" ? (
        <div className="flex items-center gap-2 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => onChange({ color: c })}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{ background: c, borderColor: color === c ? "white" : "transparent" }} />
          ))}
          <input type="color" value={color} onChange={(e) => onChange({ color: e.target.value })}
            className="w-6 h-6 rounded-full cursor-pointer" style={{ padding: 0, border: "none", background: "none" }} />
          <span className="text-xs font-mono text-white/40">{color}</span>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country..."
            className="w-full bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-white/30 font-mono focus:outline-none focus:border-blue-500/60"
          />
          <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto pr-1">
            {results.map((f) => (
              <button
                key={f.id}
                type="button"
                title={f.label}
                onClick={() => onChange({ flag: f.id })}
                className={`rounded-md border p-0.5 transition-all ${
                  flag === f.id ? "border-blue-400 ring-1 ring-blue-400" : "border-white/10 hover:border-white/40"
                }`}
              >
                <img src={flagUrl(f.id, 80)} alt={f.label} loading="lazy"
                  className="w-full h-6 object-cover rounded-sm" />
              </button>
            ))}
            {results.length === 0 && (
              <p className="col-span-5 text-[11px] font-mono text-white/40 py-2 text-center">No flags found</p>
            )}
          </div>
          <p className="text-[10px] font-mono text-white/40">
            {flag ? `Selected: ${flagLabel(flag)}` : <span className="text-amber-400/80">Pick a flag to fill the shape</span>}
          </p>
        </div>
      )}
    </div>
  );
}
