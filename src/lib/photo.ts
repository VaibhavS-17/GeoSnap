import exifr from 'exifr';
import piexif from 'piexifjs';
import { loadImg } from './overlay/map';

export type Meta = {
  dateTime: string | null; // "YYYY-MM-DDTHH:mm:ss" wall-clock
  offset: string | null; // "+05:30"
  lat: number | null;
  lng: number | null;
  alt: number | null;
  make?: string;
  model?: string;
  lens?: string;
  iso?: number;
  fNumber?: number;
  exposure?: number;
  focal?: number;
  width: number;
  height: number;
  raw: Record<string, unknown>;
};

export type Edits = { dateTime?: string; offset?: string; lat?: number; lng?: number; address?: string };

export type Photo = {
  id: string;
  file: File;
  url: string;
  original: Meta;
  edits: Edits;
};

export type Template = {
  id: string;
  name: string;
  title: string;
  showAddress: boolean;
  showCoords: boolean;
  showDate: boolean;
  showBadge: boolean;
  opacity: number;
  accent: string;
  size: number; // 0.7 - 1.4
};

export const DEFAULT_TEMPLATES: Template[] = [
  { id: 'classic', name: 'GPS Map Classic', title: 'Mumbai, MH, India \uD83C\uDDEE\uD83C\uDDF3', showAddress: true, showCoords: true, showDate: true, showBadge: true, opacity: 0.55, accent: '#f5b544', size: 1 },
  { id: 'minimal', name: 'Minimal Strip', title: 'RGIT, Versova', showAddress: false, showCoords: true, showDate: true, showBadge: false, opacity: 0.4, accent: '#ffffff', size: 0.8 },
];

const exifToInput = (v: unknown) => {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
};
const inputToExif = (v: string) => {
  const [d, t = '00:00:00'] = v.split('T');
  return `${d.replace(/-/g, ':')} ${t.length === 5 ? t + ':00' : t}`;
};

function dims(url: string): Promise<{ width: number; height: number }> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ width: i.naturalWidth, height: i.naturalHeight });
    i.onerror = () => res({ width: 0, height: 0 });
    i.src = url;
  });
}

export async function readPhoto(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file);
  const raw = ((await exifr.parse(file, { tiff: true, exif: true, gps: true, reviveValues: false }).catch(() => null)) ?? {}) as Record<string, any>;
  const gps = await exifr.gps(file).catch(() => null);
  const d = await dims(url);
  const num = (v: unknown) => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : undefined);
  return {
    id: crypto.randomUUID(),
    file,
    url,
    edits: {},
    original: {
      dateTime: exifToInput(raw.DateTimeOriginal ?? raw.CreateDate ?? raw.DateTime),
      offset: typeof raw.OffsetTimeOriginal === 'string' ? raw.OffsetTimeOriginal : null,
      lat: gps?.latitude ?? null,
      lng: gps?.longitude ?? null,
      alt: num(raw.GPSAltitude) ?? null,
      make: raw.Make,
      model: raw.Model,
      lens: raw.LensModel,
      iso: num(raw.ISO),
      fNumber: num(raw.FNumber),
      exposure: num(raw.ExposureTime),
      focal: num(raw.FocalLength),
      width: d.width,
      height: d.height,
      raw,
    },
  };
}

export function effective(p: Photo) {
  return {
    dateTime: p.edits.dateTime ?? p.original.dateTime,
    offset: p.edits.offset ?? p.original.offset ?? '+05:30',
    lat: p.edits.lat ?? p.original.lat,
    lng: p.edits.lng ?? p.original.lng,
    address: p.edits.address ?? '',
  };
}

export const isEdited = (p: Photo) => Object.values(p.edits).some((v) => v !== undefined);

export function formatStamp(dt: string | null, offset: string) {
  if (!dt) return 'Time unknown';
  const d = new Date(dt);
  if (isNaN(+d)) return dt;
  const date = d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date} ${time} GMT${offset}`;
}

export function shiftTime(dt: string, minutes: number) {
  const d = new Date(dt);
  d.setMinutes(d.getMinutes() + minutes);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

import { renderOverlayHighFidelity } from './overlay/renderer';

export async function renderOverlay(p: Photo, t: Template, maxSide = 0, dpr = 1): Promise<HTMLCanvasElement> {
  const img = await loadImg(p.url);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  
  if (maxSide && Math.max(w, h) > maxSide) {
    const k = maxSide / Math.max(w, h);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  
  return renderOverlayHighFidelity(p, t, { width: w, height: h, dpr });
}

export const canvasBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.92));

const toDataURL = (f: Blob) =>
  new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(f);
  });

export async function metadataCopy(p: Photo, baseImageBase64?: string): Promise<Blob | null> {
  if (!baseImageBase64 && !/jpe?g$/i.test(p.file.type.split('/')[1] ?? '') && !/jpe?g$/i.test(p.file.name)) return null;
  const data = baseImageBase64 || await toDataURL(p.file);
  let exif: any;
  try { exif = piexif.load(data); } catch { exif = { '0th': {}, Exif: {}, GPS: {}, '1st': {} }; }
  exif['0th'] ??= {}; exif.Exif ??= {}; exif.GPS ??= {};
  const e = effective(p);
  const notes: string[] = ['GeoSnap output'];
  if (p.edits.dateTime) {
    const v = inputToExif(p.edits.dateTime);
    exif.Exif[piexif.ExifIFD.DateTimeOriginal] = v;
    exif.Exif[piexif.ExifIFD.DateTimeDigitized] = v;
    exif['0th'][piexif.ImageIFD.DateTime] = v;
  }
  if (p.edits.offset) {
    exif.Exif[36881] = e.offset;
    exif.Exif[36882] = e.offset;
    exif.Exif[36880] = e.offset;
  }
  if (p.edits.lat != null && p.edits.lng != null) {
    exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = e.lat! >= 0 ? 'N' : 'S';
    exif.GPS[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(e.lat!));
    exif.GPS[piexif.GPSIFD.GPSLongitudeRef] = e.lng! >= 0 ? 'E' : 'W';
    exif.GPS[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(e.lng!));
  }
  exif['0th'][piexif.ImageIFD.Software] = 'GeoSnap';
  delete exif.thumbnail;
  exif['1st'] = {};
  try {
    const out = piexif.insert(piexif.dump(exif), data);
    return (await fetch(out)).blob();
  } catch {
    return null;
  }
}
