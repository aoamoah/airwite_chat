import '../styles/globals.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';

const DESCRIPTION =
  'Lightweight video conferencing built for real conditions: unreliable connections, ' +
  'expensive mobile data, and phones rather than laptops.';

export const metadata: Metadata = {
  // Needed for the generated icon and link-preview images to resolve to
  // absolute URLs. Set NEXT_PUBLIC_SITE_URL on the deployment.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'yɛhyia hyia',
    template: '%s · yɛhyia hyia',
  },
  description: DESCRIPTION,
  applicationName: 'yɛhyia hyia',
  openGraph: {
    type: 'website',
    siteName: 'yɛhyia hyia',
    title: 'yɛhyia hyia',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'yɛhyia hyia',
    description: DESCRIPTION,
  },
  // Both icon files have to be listed by hand: given icon.svg and icon.tsx in
  // the same segment, Next advertises only the SVG, leaving browsers that
  // cannot read one no way to find the other.
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon', type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: '/apple-icon', type: 'image/png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#070707',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body data-lk-theme="default">
        <Toaster />
        {children}
      </body>
    </html>
  );
}
