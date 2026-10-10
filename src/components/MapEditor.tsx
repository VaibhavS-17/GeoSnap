import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pin = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#f5b544;border:3px solid #111;box-shadow:0 0 0 2px #f5b544"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function MapEditor({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: true }).setView([lat ?? 19.1307, lng ?? 72.8197], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    m.on('click', (e) => cb.current(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => { m.remove(); map.current = null; marker.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (lat == null || lng == null) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      marker.current = L.marker([lat, lng], { icon: pin, draggable: true }).addTo(m);
      marker.current.on('dragend', () => { const p = marker.current!.getLatLng(); cb.current(p.lat, p.lng); });
      m.setView([lat, lng], m.getZoom());
    } else {
      marker.current.setLatLng([lat, lng]);
      m.setView([lat, lng], m.getZoom());
    }
  }, [lat, lng]);

  return <div ref={el} className="h-64 w-full overflow-hidden rounded-lg border border-white/10" />;
}
