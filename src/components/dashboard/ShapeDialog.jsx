import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Trash2, Save, X, Pencil } from "lucide-react";
import FillPicker from "./FillPicker";

const STORAGE_KEY = "map_layer_names";
function getStoredLayers() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

// Modal for saving a newly drawn shape
export function ShapeSaveDialog({ open, shapeType, onSave, onCancel, availableLayers }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [fillType, setFillType] = useState("color");
  const [flag, setFlag] = useState(null);
  const [layerName, setLayerName] = useState("default");
  const layerOptions = availableLayers && availableLayers.length ? availableLayers : ["default", ...getStoredLayers()];

  if (!open) return null;

  const canSave = fillType === "color" || !!flag;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ label, color, layerName, fillType, flag });
    setLabel("");
    setColor("#3b82f6");
    setFillType("color");
    setFlag(null);
    setLayerName("default");
  };

  const handleFillChange = (patch) => {
    if (patch.fillType !== undefined) setFillType(patch.fillType);
    if (patch.flag !== undefined) setFlag(patch.flag);
    if (patch.color !== undefined) setColor(patch.color);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 bg-[#0f172a] border border-white/10 rounded-xl p-5 w-80 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">New {shapeType}</h3>
          <button onClick={onCancel} className="text-white/40 hover:text-white/80 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-mono text-white/50 uppercase tracking-wider block mb-1.5">Label (optional)</label>
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="e.g. Hezbollah Zone, Buffer Area..."
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 font-mono focus:outline-none focus:border-blue-500/60" />
          </div>
          <div>
            <label className="text-xs font-mono text-white/50 uppercase tracking-wider block mb-1.5">Layer</label>
            <select value={layerName} onChange={(e) => setLayerName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500/60">
              {layerOptions.map(l => <option key={l} value={l} style={{ background: "#0f172a" }}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-mono text-white/50 uppercase tracking-wider block mb-2">Fill</label>
            <FillPicker fillType={fillType} flag={flag} color={color} onChange={handleFillChange} />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 py-2 rounded-md bg-white/5 text-white/60 text-xs font-mono hover:bg-white/10 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!canSave}
            className={`flex-1 py-2 rounded-md text-white text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${canSave ? "bg-blue-600 hover:bg-blue-500" : "bg-blue-600/30 cursor-not-allowed"}`}>
            <Save className="w-3.5 h-3.5" /> Save Shape
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Modal for editing an existing shape (label + color + layer)
export function ShapeEditDialog({ open, shape, onSave, onDelete, onCancel, availableLayers }) {
  const [label, setLabel] = useState(shape?.label || "");
  const [color, setColor] = useState(shape?.color || "#3b82f6");
  const [fillType, setFillType] = useState(shape?.fill_type || "color");
  const [flag, setFlag] = useState(shape?.flag || null);
  const [layerName, setLayerName] = useState(shape?.layer_name || "default");
  const layerOptions = availableLayers && availableLayers.length ? availableLayers : ["default", ...getStoredLayers()];

  React.useEffect(() => {
    if (shape) {
      setLabel(shape.label || "");
      setColor(shape.color || "#3b82f6");
      setFillType(shape.fill_type || "color");
      setFlag(shape.flag || null);
      setLayerName(shape.layer_name || "default");
    }
  }, [shape]);

  const canSave = fillType === "color" || !!flag;
  const payload = () => ({ label, color, layerName, fillType, flag });

  const handleFillChange = (patch) => {
    if (patch.fillType !== undefined) setFillType(patch.fillType);
    if (patch.flag !== undefined) setFlag(patch.flag);
    if (patch.color !== undefined) setColor(patch.color);
  };

  if (!open || !shape) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 bg-[#0f172a] border border-white/10 rounded-xl p-5 w-80 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Pencil className="w-4 h-4 text-blue-400" /> Edit {shape.shape_type}
          </h3>
          <button onClick={onCancel} className="text-white/40 hover:text-white/80 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-mono text-white/50 uppercase tracking-wider block mb-1.5">Label</label>
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSave && onSave(payload())}
              placeholder="Zone name..."
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 font-mono focus:outline-none focus:border-blue-500/60" />
          </div>
          <div>
            <label className="text-xs font-mono text-white/50 uppercase tracking-wider block mb-1.5">Layer</label>
            <select value={layerName} onChange={(e) => setLayerName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500/60">
              {layerOptions.map(l => <option key={l} value={l} style={{ background: "#0f172a" }}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-mono text-white/50 uppercase tracking-wider block mb-2">Fill</label>
            <FillPicker fillType={fillType} flag={flag} color={color} onChange={handleFillChange} />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={() => onDelete(shape.id)}
            className="py-2 px-3 rounded-md bg-red-600/20 text-red-400 text-xs font-mono hover:bg-red-600/40 transition-colors flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={onCancel} className="flex-1 py-2 rounded-md bg-white/5 text-white/60 text-xs font-mono hover:bg-white/10 transition-colors">Cancel</button>
          <button onClick={() => onSave(payload())} disabled={!canSave}
            className={`flex-1 py-2 rounded-md text-white text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${canSave ? "bg-blue-600 hover:bg-blue-500" : "bg-blue-600/30 cursor-not-allowed"}`}>
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Modal for confirming shape deletion
export function ShapeDeleteDialog({ open, shapeName, onConfirm, onCancel }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 bg-[#0f172a] border border-white/10 rounded-xl p-5 w-72 shadow-2xl">
        <div className="flex items-center gap-2 mb-2">
          <Trash2 className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-mono font-bold text-white">Delete Shape?</h3>
        </div>
        <p className="text-xs text-white/50 font-mono mb-5">"{shapeName}" will be permanently removed from the map.</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-md bg-white/5 text-white/60 text-xs font-mono hover:bg-white/10 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-semibold transition-colors">Delete</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
