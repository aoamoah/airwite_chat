import { ImageResponse } from 'next/og';

/**
 * Raster fallback beside icon.svg, for browsers that do not take an SVG
 * favicon — Safari before 16.4, and most feed readers and link unfurlers.
 */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
        <div style={{ width: 15, height: 15, borderRadius: 8, background: '#f2b135' }} />
        <div
          style={{
            width: 15,
            height: 15,
            borderRadius: 8,
            background: '#27b0a0',
            opacity: 0.85,
            marginLeft: -7,
          }}
        />
      </div>
    </div>,
    size,
  );
}
