import { Photo, Template, effective, formatStamp } from '../photo';
import { ensureFontsLoaded } from './font';
import { wrapText } from './layout';
import { drawMapThumbnail, loadImg } from './map';

export async function renderOverlayHighFidelity(
  p: Photo,
  t: Template,
  exportConfig: { width: number; height: number; dpr: number }
): Promise<HTMLCanvasElement> {
  const { width: w, height: h, dpr } = exportConfig;
  const s = (w / 1400) * t.size;

  await ensureFontsLoaded(['Inter', 'system-ui', 'sans-serif']);

  const img = await loadImg(p.url);
  const c = document.createElement('canvas');
  c.width = w * dpr;
  c.height = h * dpr;

  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.drawImage(img, 0, 0, w, h);

  const e = effective(p);

  // Define typographic scale
  const fontHeadline = `500 ${22 * s}px Inter, system-ui, sans-serif`;
  const fontBody = `400 ${16 * s}px Inter, system-ui, sans-serif`;
  const fontBadge = `500 ${13 * s}px Inter, system-ui, sans-serif`;

  // Pre-calculate lines and wrapping
  const pad = 12 * s;
  const gap = 3 * s;
  const maxTextWidthLimit = Math.max(500 * s, w * 0.85);

  const lines: { text: string; font: string; isHeadline?: boolean }[] = [];

  if (t.title) {
    const wrapped = wrapText(ctx, t.title, maxTextWidthLimit, fontHeadline);
    wrapped.forEach((text, idx) => lines.push({ text, font: fontHeadline, isHeadline: true }));
  }
  if (t.showAddress && e.address) {
    const wrapped = wrapText(ctx, e.address, maxTextWidthLimit, fontBody);
    wrapped.forEach((text) => lines.push({ text, font: fontBody }));
  }
  if (t.showCoords && e.lat != null && e.lng != null) {
    lines.push({ text: `Lat ${e.lat.toFixed(6)}, Long ${e.lng.toFixed(6)}`, font: fontBody });
  }
  if (t.showDate) {
    lines.push({ text: formatStamp(e.dateTime, e.offset), font: fontBody });
  }
  if (t.showBadge) {
    lines.push({ text: 'Note : Captured by GPS Map Camera', font: fontBody });
  }

  // Calculate Text Block Size
  let textH = 0;
  let maxTextW = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    ctx.font = l.font;
    maxTextW = Math.max(maxTextW, ctx.measureText(l.text).width);
    textH += l.isHeadline ? 22 * s : 16 * s;
    if (i < lines.length - 1) textH += gap;
  }

  // Layout calculations
  const mapSize = textH + pad * 2;
  const cardH = mapSize;
  const cardW = mapSize + pad + maxTextW + pad * 1.5;
  
  const cardX = (w - cardW) / 2;
  const cardY = h - cardH - 24 * s;

  ctx.fillStyle = `rgba(0,0,0,${t.opacity})`;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 10 * s);
  ctx.fill();

  const mapX = cardX;
  const mapY = cardY;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(mapX, mapY, mapSize, mapSize, 10 * s);
  ctx.clip();
  await drawMapThumbnail(ctx, e.lat, e.lng, mapX, mapY, mapSize);
  ctx.restore();

  ctx.textBaseline = 'top';
  let cy = cardY + pad;
  const textX = mapX + mapSize + pad;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    ctx.font = l.font;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(l.text, textX, cy);
    cy += (l.isHeadline ? 22 * s : 16 * s) + gap;
  }

  if (t.showBadge) {
    const badgeText = 'GPS Map Camera';
    ctx.font = fontBadge;
    const bwText = ctx.measureText(badgeText).width;
    const badgeIconSize = 14 * s;
    const badgeGap = 5 * s;
    const badgePadX = 8 * s;
    const badgePadY = 4 * s;
    const badgeW = badgePadX + badgeIconSize + badgeGap + bwText + badgePadX;
    const badgeH = badgeIconSize + badgePadY * 2;

    const badgeX = cardX + cardW - badgeW;
    const badgeY = cardY - badgeH - 2 * s;

    ctx.fillStyle = `rgba(0,0,0,${t.opacity})`;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6 * s);
    ctx.fill();

    const ix = badgeX + badgePadX;
    const iy = badgeY + badgePadY;

    ctx.fillStyle = '#1a73e8';
    ctx.beginPath();
    ctx.roundRect(ix, iy, badgeIconSize, badgeIconSize, 2 * s);
    ctx.fill();

    const cx = ix + badgeIconSize / 2;
    const ccy = iy + badgeIconSize / 2;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(
      cx - badgeIconSize * 0.3,
      ccy - badgeIconSize * 0.2 + badgeIconSize * 0.05,
      badgeIconSize * 0.6,
      badgeIconSize * 0.4,
      1 * s
    );
    ctx.fill();

    ctx.fillStyle = '#fbbc04';
    ctx.beginPath();
    ctx.arc(cx, ccy + badgeIconSize * 0.05, badgeIconSize * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, ix + badgeIconSize + badgeGap, badgeY + badgeH / 2);
  }

  return c;
}
