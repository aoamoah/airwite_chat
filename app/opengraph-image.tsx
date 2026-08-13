import { ImageResponse } from 'next/og';

/** Link preview for the site, generated at build time rather than shipped as a binary. */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'yɛhyia hyia — lightweight video conferencing';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#111111',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '0 96px',
      }}
    >
      <div style={{ display: 'flex', marginBottom: 48 }}>
        <div style={{ width: 108, height: 108, borderRadius: 54, background: '#f2b135' }} />
        <div
          style={{
            width: 108,
            height: 108,
            borderRadius: 54,
            background: '#27b0a0',
            opacity: 0.85,
            marginLeft: -48,
          }}
        />
      </div>
      <div style={{ display: 'flex', fontSize: 108, color: '#ffffff', letterSpacing: -2 }}>
        yɛhyia hyia
      </div>
      <div style={{ display: 'flex', fontSize: 40, color: 'rgba(255,255,255,0.6)', marginTop: 20 }}>
        Meetings that hold on a weak connection
      </div>
    </div>,
    size,
  );
}
