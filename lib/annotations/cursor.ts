/**
 * Builds a pencil cursor as an inline SVG, tinted to the active stroke color so
 * the pointer previews what it will draw.
 *
 * An SVG data URI beats a bitmap here: it stays crisp on high-DPI displays,
 * needs no network request, and can be recolored without shipping a file per
 * palette entry. The white outline keeps it visible over dark shared content.
 */
export function pencilCursor(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
<path d="M3 23l1.3-4.6L17 5.7l3.3 3.3L7.6 21.7 3 23z" fill="${color}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M18.4 4.3l1.7-1.7a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8l-1.7 1.7-3.3-3.3z" fill="#fff" stroke="#1a1a1a" stroke-width="1.1" stroke-linejoin="round"/>
</svg>`;
  // Hotspot at (3, 23): the pencil's tip, so the line starts where it points.
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 23, crosshair`;
}
