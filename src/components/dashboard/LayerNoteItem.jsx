import React from "react";
import { base44 } from "@/api/base44Client";
import { ExternalLink, Trash2 } from "lucide-react";
import { videoEmbed } from "@/lib/videoEmbed";
import XVideo from "./XVideo";

export default function LayerNoteItem({ note, onDeleted }) {
  const remove = async () => {
    await base44.entities.layer_notes.delete(note.id);
    onDeleted();
  };

  const url = (note.url || "").trim();
  const isLink = /^https?:\/\//i.test(url);
  const linkHref = url && !isLink ? `https://${url}` : url;

  return (
    <div className="group rounded-md border border-white/10 bg-white/[0.03] p-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {note.title && (
            <p className="text-[11px] font-mono font-semibold text-white/80 mb-1" dir="auto">{note.title}</p>
          )}

          {note.kind === "text" && (
            <p className="text-[11px] text-white/70 whitespace-pre-wrap leading-relaxed" dir="auto">{note.text}</p>
          )}

          {note.kind === "link" && url && (
            <a
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 break-all"
              dir="ltr"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              <span className="truncate">{note.title || url}</span>
            </a>
          )}

          {note.kind === "video" && url && (() => {
            const embed = videoEmbed(url);
            if (embed?.type === "x") return <XVideo id={embed.id} href={linkHref} title={note.title} />;
            if (embed?.type === "video") {
              return <video src={embed.src} controls preload="metadata" playsInline className="w-full rounded border border-white/10 bg-black max-h-72" />;
            }
            if (embed?.type === "iframe") {
              return (
                <iframe
                  src={embed.src}
                  title={note.title || "סרטון"}
                  loading="lazy"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="w-full rounded border border-white/10 bg-black"
                  style={embed.ratio ? { aspectRatio: embed.ratio, maxHeight: "60vh" } : { height: embed.height }}
                />
              );
            }
            // A site that can't be played here: link to it instead.
            return (
              <a href={linkHref} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 break-all" dir="ltr">
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{note.title || "פתח סרטון"}</span>
              </a>
            );
          })()}

          {note.kind === "video" && url && note.title && (
            <a href={linkHref} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono text-white/40 hover:text-cyan-300">
              <ExternalLink className="w-2.5 h-2.5" /> מקור
            </a>
          )}

          {note.kind === "image" && url && (
            <img
              src={linkHref}
              alt={note.title || ""}
              loading="lazy"
              className="w-full rounded border border-white/10 object-cover max-h-56"
            />
          )}
        </div>

        <button
          onClick={remove}
          title="מחק פריט"
          className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-red-400 transition-all shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

