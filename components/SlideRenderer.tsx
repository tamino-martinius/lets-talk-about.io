'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const THEME_PARAMS = [
  'colorTheme',
  'colorForeground',
  'colorBackground',
  'colorVignette',
  'colorSectionForeground',
] as const;

const LAYOUT_PARAMS = ['header', 'footer', 'watermark'] as const;

export default function SlideRenderer() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const markdownUrl = searchParams.get('markdown');
    if (!markdownUrl) {
      setError('Missing required "markdown" query parameter.');
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(markdownUrl!);
        if (!res.ok) throw new Error(`Failed to fetch markdown: ${res.status}`);
        const source = await res.text();

        const { compile } = await import('lets-talk-about/compiler');
        const { init } = await import('lets-talk-about/client/slides');

        const theme: Record<string, string> = {};
        for (const key of THEME_PARAMS) {
          const val = searchParams.get(key);
          if (val) theme[key] = val;
        }

        const layout: Record<string, string> = {};
        for (const key of LAYOUT_PARAMS) {
          const val = searchParams.get(key);
          if (val) layout[key] = val;
        }

        const config = { theme, layout };
        const { title, slides } = compile(source, config);

        if (cancelled) return;

        document.title = title;

        const themeDefaults: Record<string, string> = {
          colorTheme: '#6c6',
          colorForeground: '#000',
          colorBackground: '#fff',
          colorVignette: '#765',
          colorSectionForeground: '#fff',
        };
        const merged = { ...themeDefaults, ...theme };
        const root = document.documentElement;
        for (const [key, value] of Object.entries(merged)) {
          const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
          root.style.setProperty(cssVar, value);
        }

        const section = document.querySelector('section.slides');
        if (section) {
          section.innerHTML = slides.join('\n');
        }

        init();
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'system-ui, sans-serif',
          color: '#fff',
          background: '#111',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <p>{error}</p>
      </div>
    );
  }

  return <section className="slides layout-regular template-default" />;
}
