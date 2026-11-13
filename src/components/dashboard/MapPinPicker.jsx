import React, { useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, useMapEvents, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, MapPin, Check } from "lucide-react";

function makeIcon(color = "#ef4444") {
  return new L.DivIcon({
    className: "",
    html: `<div style="
      width: 18px; height: 18px;
      background: ${color};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 12px ${color}cc;
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
  });
  return null;
}

export default function MapPinPicker({ color = "#ef4444", center, onConfirm, onClose }) {
  const [pinned, setPinned] = useState(null);
  const mapCenter = center ? [center.lat, center.lng] : [33.1, 35.2];

  const handleConfirm = () => {
    if (!pinned) return;
    onConfirm(pinned);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[#0f172a] border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col"
           style={{ width: "min(700px, 95vw)", height: "min(500px, 90vh)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-400" />
            <span className="text-sm font-mono font-bold text-white">לחץ על המפה לסימון מיקום</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer
            center={mapCenter}
            zoom={center ? 10 : 9}
            className="w-full h-full"
            style={{ height: "100%" }}
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org">OSM</a>'
            />
            <ClickHandler onPick={setPinned} />
            {pinned && (
              <Marker
                position={[pinned.lat, pinned.lng]}
                icon={makeIcon(color)}
              />
            )}
          </MapContainer>

          {/* Coords overlay */}
          {pinned && (
            <div className="absolute bottom-3 left-3 z-[1000] bg-black/80 border border-white/10 rounded-md px-3 py-1.5 text-xs font-mono text-white/80">
              {pinned.lat.toFixed(5)}, {pinned.lng.toFixed(5)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-white/10 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-md bg-white/5 text-white/60 text-xs font-mono hover:bg-white/10 transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleConfirm}
            disabled={!pinned}
            className="flex-1 py-2 rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> אשר מיקום
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
