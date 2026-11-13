import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

// Markers that sit close together merge into one circle showing how many there
// are; zooming in (or clicking it) spreads them back out. The circle takes the
// most common color among its markers, so a cluster still hints at its topic.
// Each marker passes its color as the `clusterColor` option.
export function createClusterGroup({ shape = "circle" } = {}) {
  return L.markerClusterGroup({
    maxClusterRadius: 40,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    chunkedLoading: true,
    iconCreateFunction(cluster) {
      const counts = {};
      cluster.getAllChildMarkers().forEach((m) => {
        const c = m.options.clusterColor || "#3b82f6";
        counts[c] = (counts[c] || 0) + 1;
      });
      const color = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      const n = cluster.getChildCount();
      const size = n < 10 ? 28 : n < 100 ? 34 : 40;
      return new L.DivIcon({
        className: "",
        html: `<div class="marker-cluster-badge" style="
          width:${size}px;height:${size}px;
          border-radius:${shape === "diamond" ? "6px" : "50%"};
          border:2px solid ${color};
          box-shadow:0 0 10px ${color}88;
        ">${n}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    },
  });
}
