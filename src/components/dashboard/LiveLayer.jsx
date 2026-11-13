import React, { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { LIVE_COLORS, timeAgo } from "@/lib/liveFeeds";
import { fetchEventSourceUrl } from "@/lib/monitorSituationFeed";
import { createClusterGroup } from "@/lib/markerCluster";

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Live items use a diamond marker so they read differently from the user's round POI dots.
function makeLiveIcon(color) {
  return new L.DivIcon({
    className: "",
    html: `<div style="
      width: 11px; height: 11px;
      background: ${color};
      transform: rotate(45deg);
      border: 1.5px solid rgba(255,255,255,0.9);
      box-shadow: 0 0 8px ${color}cc;
    "></div>`,
    iconSize: [11, 11],
    iconAnchor: [5, 5],
    popupAnchor: [0, -10]
  });
}

function popupHTML(item, color, saved) {
  return `
    <div style="min-width:210px;font-family:'JetBrains Mono',monospace" dir="rtl">
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:${color}">
        <span style="display:inline-block;width:7px;height:7px;background:${color};transform:rotate(45deg);flex-shrink:0"></span>
        ${escapeHtml(item.title)}
      </div>
      ${item.detail ? `<div style="font-size:10px;color:#9ca3af;margin-top:4px">${escapeHtml(item.detail)}</div>` : ""}
      ${item.summary ? `<div style="font-size:11px;color:#e5e7eb;margin-top:5px;line-height:1.45">${escapeHtml(item.summary)}</div>` : ""}
      <div style="font-size:10px;color:#9ca3af;margin-top:6px">${escapeHtml(item.sourceName || "")}${item.time ? ` · ${escapeHtml(timeAgo(item.time))}` : ""}</div>
      ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="display:block;font-size:11px;color:#60a5fa;margin-top:6px">↗ פתח מקור</a>` : item.eventId ? `<button data-live-source style="margin-top:6px;padding:0;border:0;background:none;font-family:inherit;font-size:11px;color:#60a5fa;cursor:pointer">↗ פתח מקור</button>` : ""}
      ${item.eventId ? `<button data-live-details style="margin-top:6px;padding:0;border:0;background:none;font-family:inherit;font-size:11px;color:#22d3ee;cursor:pointer">▤ מקורות ומדיה</button>` : ""}
      <button data-live-save ${saved ? "disabled" : ""} style="margin-top:8px;width:100%;padding:5px;border-radius:4px;border:1px solid ${color}66;background:${color}22;color:${saved ? "#9ca3af" : "#ffffff"};font-size:10px;font-family:inherit;cursor:${saved ? "default" : "pointer"}">
        ${saved ? "נשמר ✓" : "+ שמור כנקודת מחקר"}
      </button>
    </div>`;
}

export default function LiveLayer({ subscribe, getItems, onSave, savedIds = [], onDetails }) {
  const map = useMap();
  const groupRef = useRef(null);
  const onSaveRef = useRef(onSave);
  const savedRef = useRef(savedIds);
  const onDetailsRef = useRef(onDetails);

  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { savedRef.current = savedIds; }, [savedIds]);
  useEffect(() => { onDetailsRef.current = onDetails; }, [onDetails]);

  const draw = () => {
    if (!map) return;
    if (groupRef.current) groupRef.current.clearLayers();
    else groupRef.current = createClusterGroup({ shape: "diamond" }).addTo(map);

    getItems().forEach((item) => {
      if (typeof item.lat !== "number" || typeof item.lon !== "number") return;
      const color = LIVE_COLORS[item.group] || "#a855f7";
      const marker = L.marker([item.lat, item.lon], {
        icon: makeLiveIcon(color),
        zIndexOffset: 500,
        clusterColor: color
      });
      marker.bindPopup(popupHTML(item, color, savedRef.current.includes(item.id)));
      marker.on("popupopen", (e) => {
        const el = e.popup.getElement();
        const btn = el && el.querySelector("[data-live-save]");
        if (btn && !btn.disabled) {
          btn.addEventListener("click", () => {
            btn.disabled = true;
            btn.textContent = "נשמר ✓";
            onSaveRef.current && onSaveRef.current(item);
          });
        }
        const src = el && el.querySelector("[data-live-source]");
        if (src) {
          // Warm the source link as soon as the popup opens so a click is instant.
          fetchEventSourceUrl(item.eventId).catch(() => null);
          src.addEventListener("click", async () => {
            const tab = window.open("", "_blank");
            if (tab) tab.opener = null;
            const url = (await fetchEventSourceUrl(item.eventId).catch(() => null))?.url;
            if (url && tab) tab.location.replace(url);
            else if (tab) tab.close();
          });
        }
        const details = el && el.querySelector("[data-live-details]");
        if (details) {
          details.addEventListener("click", () => onDetailsRef.current && onDetailsRef.current(item));
        }
      });
      groupRef.current.addLayer(marker);
    });
  };

  useEffect(() => {
    if (!map) return;
    draw();
    const unsub = subscribe(draw);
    return () => {
      unsub();
      if (groupRef.current) groupRef.current.clearLayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}
