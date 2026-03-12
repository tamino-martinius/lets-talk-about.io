import 'lets-talk-about/client/styles.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Slides',
};

export const viewport: Viewport = {
  width: 1100,
  height: 750,
};

export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
