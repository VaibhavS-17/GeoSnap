export function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });
}

async function fetchWithCache(url: string): Promise<Blob | null> {
  try {
    const cache = await caches.open('geosnap-tiles');
    const cached = await cache.match(url);
    if (cached) return await cached.blob();
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    await cache.put(url, new Response(blob));
    return blob;
  } catch {
    return null; // Offline or error
  }
}

export async function drawMapThumbnail(
  ctx: CanvasRenderingContext2D,
  lat: number | null,
  lng: number | null,
  x: number,
  y: number,
  size: number
): Promise<void> {
  if (lat == null || lng == null) {
    drawOfflinePlaceholder(ctx, x, y, size);
    return;
  }

  const z = 16;
  const n = Math.pow(2, z);
  const xTile = (lng + 180) / 360 * n;
  const latRad = (lat * Math.PI) / 180;
  const yTile = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

  const tileSize = 256;
  const px = xTile * tileSize;
  const py = yTile * tileSize;

  const startPx = px - size / 2;
  const startPy = py - size / 2;

  const startCol = Math.floor(startPx / tileSize);
  const startRow = Math.floor(startPy / tileSize);
  const endCol = Math.floor((startPx + size) / tileSize);
  const endRow = Math.floor((startPy + size) / tileSize);

  ctx.fillStyle = '#2a3b2c';
  ctx.fillRect(x, y, size, size);

  const tiles: Promise<void>[] = [];
  let successfulTiles = 0;

  for (let c = startCol; c <= endCol; c++) {
    for (let r = startRow; r <= endRow; r++) {
      tiles.push(
        (async () => {
          try {
            const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${r}/${c}`;
            const blob = await fetchWithCache(url);
            if (!blob) return;

            const objUrl = URL.createObjectURL(blob);
            const img = await loadImg(objUrl);
            URL.revokeObjectURL(objUrl);

            const drawX = x + (c * tileSize - startPx);
            const drawY = y + (r * tileSize - startPy);

            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, size, size);
            ctx.clip();
            ctx.drawImage(img, drawX, drawY, tileSize, tileSize);
            ctx.restore();
            
            successfulTiles++;
          } catch (e) {
            // Ignore individual tile failure
          }
        })()
      );
    }
  }

  await Promise.all(tiles);

  if (successfulTiles === 0) {
    drawOfflinePlaceholder(ctx, x, y, size);
  } else {
    drawRedPin(ctx, x, y, size);
  }
}

function drawOfflinePlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#2a3b2c';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(12, size * 0.1)}px sans-serif`;
  ctx.fillText('Map Offline', x + size / 2, y + size / 2);
}

function drawRedPin(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const pinH = size * 0.15;
  const pw = pinH * 0.65;
  const cx = x + size / 2;
  const cy = y + size / 2 + pinH * 0.4;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(pw / 2, -pinH * 0.4, pw / 2, -pinH * 0.7, pw / 2, -pinH * 0.75);
  ctx.arc(0, -pinH * 0.75, pw / 4, 0, Math.PI, true);
  ctx.bezierCurveTo(-pw / 2, -pinH * 0.7, -pw / 2, -pinH * 0.4, 0, 0);
  ctx.fillStyle = '#ea4335';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, -pinH * 0.75, pw / 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#6b1c16';
  ctx.fill();
  ctx.restore();
}
