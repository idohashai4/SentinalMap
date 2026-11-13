import React from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Info, Loader2, Pencil, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import LayerNoteForm from "./LayerNoteForm";
import LayerNoteItem from "./LayerNoteItem";

export default function LayerInfoPanel({ shape, onClose, onEditShape }) {
  const queryClient = useQueryClient();
  const shapeId = shape?.id;
  const layerName = shape?.layer_name || "default";

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["layer_notes", shapeId],
    queryFn: async () =>
      (await base44.entities.layer_notes.filter(
        { shape_id: shapeId },
        { sort: "-created_date", limit: 100 }
      )).items,
    enabled: !!shapeId
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["layer_notes", shapeId] });

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="absolute top-0 right-0 h-full w-full max-w-[400px] bg-[#0f172a] border-l border-white/10 shadow-2xl flex flex-col"
      >
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
          <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 truncate" dir="auto">מידע נוסף · שכבה {layerName}</p>
            <h3 className="text-sm font-mono font-bold text-white truncate" dir="auto">{shape?.label || "אלמנט ללא שם"}</h3>
          </div>
          {onEditShape && (
            <button
              onClick={onEditShape}
              title="ערוך את הצורה"
              className="text-white/40 hover:text-cyan-400 transition-colors shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-[10px] font-mono text-white/30 shrink-0">{notes.length}</span>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs font-mono text-white/40">
              <Loader2 className="w-4 h-4 animate-spin" /> טוען...
            </div>
          ) : notes.length === 0 ? (
            <p className="text-center text-[11px] font-mono text-white/30 py-8">
              עדיין אין מידע לאלמנט זה
            </p>
          ) : (
            notes.map(note => (
              <LayerNoteItem key={note.id} note={note} onDeleted={refresh} />
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 p-3 bg-white/[0.02]">
          <LayerNoteForm shapeId={shapeId} layerName={layerName} onAdded={refresh} />
        </div>
      </motion.aside>
    </div>,
    document.body
  );
}