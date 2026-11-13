import React from "react";

const PRESET_COLORS = [
  { label: "Red (Threat)", value: "#ef4444" },
  { label: "Orange (Warning)", value: "#f97316" },
  { label: "Yellow (Caution)", value: "#eab308" },
  { label: "Green (Safe)", value: "#22c55e" },
  { label: "Blue (Intel)", value: "#3b82f6" },
  { label: "Purple (Unknown)", value: "#8b5cf6" },
  { label: "Pink (Civilian)", value: "#ec4899" },
  { label: "White (Neutral)", value: "#e2e8f0" },
];

export default function ColorPicker({ value, onChange }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => onChange(c.value)}
            className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110"
            style={{
              background: c.value,
              borderColor: value === c.value ? "white" : "transparent",
              boxShadow: value === c.value ? `0 0 0 1px ${c.value}` : "none"
            }}
          />
        ))}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-all"
          title="Custom color"
          style={{ padding: 0, background: "none" }}
        />
      </div>
    </div>
  );
}
