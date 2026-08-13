import { ImageResponse } from 'next/og';

/**
 * Home-screen icon for iOS, which does not accept the SVG favicon.
 *
 * Deliberately the mark alone, with no lettering: at 180px a wordmark would be
 * unreadable, and the glyphs would depend on a font this generator would have
 * to embed.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#111111',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex' }}>
        <div style={{ width: 84, height: 84, borderRadius: 42, background: '#f2b135' }} />
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            background: '#27b0a0',
            opacity: 0.85,
            marginLeft: -38,
          }}
        />
      </div>
    </div>,
    size,
  );
}
