import React, { useState } from "react";
import { Layers, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import PanelSection from "./PanelSection";

const STORAGE_KEY = "map_layer_names";

function readStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

// Shape layers: show/hide, add an empty layer, delete a layer with its shapes.
export default function LayersPanel({ shapes = [], visibleLayers = {}, onToggleLayer, onDeleteLayer, onLayerNamesChange, className = "" }) {
  const [newName, setNewName] = useState("");
  const [stored, setStored] = useState(readStored);
  const [confirm, setConfirm] = useState(null);

  const counts = {};
  shapes.forEach((s) => {
    const layer = s.layer_name || "default";
    counts[layer] = (counts[layer] || 0) + 1;
  });
  const names = [...new Set(["default", ...stored, ...Object.keys(counts)])];

  const saveStored = (next) => {
    setStored(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    onLayerNamesChange?.(next);
  };

  const addLayer = () => {
    const name = newName.trim();
    if (!name || names.includes(name)) return;
    saveStored([...stored, name]);
    setNewName("");
  };

  const removeLayer = async (name) => {
    setConfirm(null);
    saveStored(stored.filter((n) => n !== name));
    if (counts[name]) await onDeleteLayer?.(name);
  };

  return (
    <PanelSection
      icon={Layers}
      title="שכבות"
      accent="chart4"
      className={`lg:min-w-[210px] lg:max-w-[250px] lg:bg-card/90 lg:backdrop-blur-sm ${className}`}
      action={<span className="text-[10px] font-mono font-semibold text-foreground/75">{names.length}</span>}
      bodyClassName="p-2 space-y-2"
    >
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {names.map((name) => {
          const visible = visibleLayers[name] !== false;
          return (
            <div key={name} className="flex items-center gap-1 group">
              <button
                onClick={() => onToggleLayer?.(name)}
                className={`flex-1 min-w-0 flex items-center gap-2 text-left px-2 py-1 rounded-md border transition-all text-[11px] font-mono ${
                  visible ? "bg-primary/10 border-primary/30 text-foreground" : "bg-muted/20 border-transparent text-foreground/60 hover:bg-muted/40"
                }`}
              >
                {visible ? <Eye className="w-3 h-3 shrink-0 text-primary" /> : <EyeOff className="w-3 h-3 shrink-0 text-muted-foreground/60" />}
                <span className="truncate" dir="auto">{name}</span>
                <span className="ml-auto text-[10px] font-semibold text-foreground/65">{counts[name] || 0}</span>
              </button>
              {name !== "default" && (
                confirm === name ? (
                  <button onClick={() => removeLayer(name)} className="px-1.5 py-1 rounded text-[10px] font-mono bg-red-600 text-white hover:bg-red-500">
                    מחק
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirm(name)}
                    title="מחק שכבה וכל הצורות שבה"
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground/60 hover:text-red-400 transition-all p-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addLayer()}
          placeholder="שכבה חדשה..."
          className="flex-1 min-w-0 bg-muted/40 border border-border rounded-md px-2 py-1.5 text-[10px] font-mono text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary/50"
        />
        <button onClick={addLayer} aria-label="הוסף שכבה" className="px-2 rounded-md bg-muted/60 hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-all">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </PanelSection>
  );
}
