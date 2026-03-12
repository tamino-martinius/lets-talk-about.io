import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'lets-talk-about — Create beautiful slides from Markdown',
  description:
    'Easily create slides from Markdown. Customize with HTML and CSS. Host for free on GitHub Pages.',
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%', overflow: 'hidden' }}>
      <body style={{ height: '100%', margin: 0, overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
