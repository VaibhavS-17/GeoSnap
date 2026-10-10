export async function ensureFontsLoaded(fonts: string[]): Promise<void> {
  if (!('fonts' in document)) return;
  await Promise.all(fonts.map(f => document.fonts.load(f).catch(() => {})));
}
