import React, { useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { MapPin, Calendar, ChevronRight, Trash2, AlertCircle, X, Link2, Pencil, Folder } from "lucide-react";
import PointEditDialog from "./PointEditDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function ActivityFeed({ pois = [], topics = [], onSelectPoint, onChanged }) {
  const [confirmId, setConfirmId] = useState(null);
  const [editPoi, setEditPoi] = useState(null);
  const { toast } = useToast();

  const handleDelete = async () => {
    await base44.entities.points_of_interest.delete(confirmId);
    toast({ title: "הנקודה נמחקה", duration: 2000 });
    setConfirmId(null);
    onChanged();
  };

  const handleAssignTopic = async (poi, topic) => {
    if ((poi.topic || "כללי") === topic) return;
    await base44.entities.points_of_interest.update(poi.id, { topic });
    toast({ title: "השיוך עודכן", description: topic, duration: 2000 });
    onChanged();
  };

  if (!pois || pois.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <MapPin className="w-8 h-8 mb-3 opacity-30" />
        <p className="text-sm font-mono">עדיין אין נקודות עניין</p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[300px] lg:h-[340px]">
        <div className="space-y-2 pr-2">
          <AnimatePresence>
            {pois.map((poi, i) => (
              <motion.div
                key={poi.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ delay: i * 0.04 }}
                className="group relative border border-border/40 border-l-2 bg-muted/20 hover:bg-muted/40 rounded-md p-3 transition-all"
                style={{ borderLeftColor: poi.marker_color || "#3b82f6" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => poi.latitude && poi.longitude && onSelectPoint(poi)}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <MapPin className="w-3 h-3 shrink-0" style={{ color: poi.marker_color || "#3b82f6" }} />
                      <span className="text-sm font-semibold text-foreground truncate">
                        {poi.title}
                      </span>
                      {(!poi.latitude || !poi.longitude) && (
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1 rounded">no coords</span>
                      )}
                    </div>
                    <div
                      className="flex items-center gap-1.5 mb-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Folder className="w-3 h-3 text-muted-foreground shrink-0" />
                      <select
                        value={poi.topic || "כללי"}
                        onChange={(e) => handleAssignTopic(poi, e.target.value)}
                        title="שיוך לתיקייה"
                        className="max-w-[170px] bg-card border border-border/60 hover:border-primary/50 rounded px-1.5 py-0.5 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/60 cursor-pointer"
                      >
                        {!topics.some((t) => t.name === (poi.topic || "כללי")) && (
                          <option value={poi.topic || "כללי"}>{poi.topic || "כללי"}</option>
                        )}
                        {topics.map((t) => (
                          <option key={t.id} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    {poi.event_date && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground font-mono">
                          {format(new Date(poi.event_date), "dd MMM yyyy · HH:mm")}
                        </span>
                      </div>
                    )}
                    {poi.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{poi.description}</p>
                    )}
                    {poi.tags && poi.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {poi.tags.map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/15 text-primary border border-primary/30">{t}</span>
                        ))}
                      </div>
                    )}
                    {poi.media_url && (
                      <a
                        href={poi.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 mt-1.5 text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <Link2 className="w-3 h-3" /> פתח קישור
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {poi.latitude && poi.longitude && (
                      <ChevronRight
                        onClick={() => onSelectPoint(poi)}
                        className="w-4 h-4 text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      />
                    )}
                    <button
                      onClick={() => setEditPoi(poi)}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmId(poi.id)}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {editPoi && (
        <PointEditDialog
          poi={editPoi}
          topics={topics}
          onClose={() => setEditPoi(null)}
          onSaved={onChanged}
        />
      )}

      {confirmId && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmId(null)} />
          <div className="relative z-10 bg-[#0f172a] border border-white/10 rounded-xl p-5 w-72 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-mono font-bold text-white">מחיקת נקודה?</h3>
              <button onClick={() => setConfirmId(null)} className="ml-auto text-white/40 hover:text-white/80">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/50 font-mono mb-5">
              הפעולה אינה ניתנת לשחזור. נקודת העניין תימחק לצמיתות.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="flex-1 py-2 rounded-md bg-white/5 text-white/60 text-xs font-mono hover:bg-white/10 transition-colors"
              >ביטול</button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-semibold transition-colors"
              >מחק</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
