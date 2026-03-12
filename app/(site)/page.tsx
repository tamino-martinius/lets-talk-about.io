'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { IconChart1 } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconChart1';
import { IconGithub } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconGithub';
import { IconNpm } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconNpm';
import { IconMarkdown } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconMarkdown';
import { IconPreview } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconPreview';
import { IconConsoleSimple } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconConsoleSimple';
import { IconSlidesWide } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconSlidesWide';
import { IconLaw } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconLaw';

const CodeEditor = dynamic(() => import('@/components/CodeEditor'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
      loading editor...
    </div>
  ),
});

const EXAMPLE_SLIDES = `---
title: My Presentation
---

# Hello World

## Created with lets-talk-about

---
type: section

# Getting Started

---

## Features

- Markdown-based slides
- Syntax highlighting
- Background images
- Build animations

---
build: true

## Incremental Reveal

- First point
- Second point
- Third point
- Fourth point

---

## Code Example

\`\`\`js linenums h2
const greeting = 'Hello, World!';
console.log(greeting);
\`\`\`

---
template: two-column

## Comparing Options

- Option A
- Simple
- Fast

::right::

## Another View

- Option B
- Flexible
- Powerful

---
template: title-content

::title::

## Key Takeaways

::default::

- Slides are written in Markdown
- Templates arrange content with named slots
- Layouts add persistent headers, footers, and watermarks

---
type: section

# Thank You!
`;

const THEME_DEFAULTS: Record<string, string> = {
  colorTheme: '#6c6',
  colorForeground: '#000',
  colorBackground: '#fff',
  colorVignette: '#765',
  colorSectionForeground: '#fff',
};

function getSlideAtLine(source: string, lineNumber: number): number {
  const lines = source.split('\n');
  let slideIndex = 0;
  let frontmatterEnd = 0;

  // Detect frontmatter: first line must be ---
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        frontmatterEnd = i + 1;
        break;
      }
    }
  }

  // Count --- separators after frontmatter, up to cursor line (1-based)
  for (let i = frontmatterEnd; i < Math.min(lineNumber - 1, lines.length); i++) {
    if (lines[i].trim() === '---') {
      slideIndex++;
    }
  }

  return slideIndex;
}

export default function HomePage() {
  const [source, setSource] = useState(EXAMPLE_SLIDES);
  const [slideCount, setSlideCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewReady = useRef(false);
  const pendingSource = useRef<string | null>(null);
  const cursorLineRef = useRef(1);

  const gotoSlide = useCallback((slideIndex: number) => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !previewReady.current) return;
    win.postMessage({ type: 'goto-slide', index: slideIndex }, '*');
  }, []);

  const handleCursorLine = useCallback((line: number) => {
    cursorLineRef.current = line;
    const slideIndex = getSlideAtLine(source, line);
    gotoSlide(slideIndex);
  }, [source, gotoSlide]);

  const sendToPreview = useCallback((markdown: string) => {
    if (!iframeRef.current?.contentWindow || !previewReady.current) {
      pendingSource.current = markdown;
      return;
    }

    import('lets-talk-about/compiler').then(({ compile }) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;

      try {
        const config = { theme: THEME_DEFAULTS };
        const { title, slides } = compile(markdown.trim(), config);
        setSlideCount(slides.length);

        const activeSlide = getSlideAtLine(markdown, cursorLineRef.current);

        win.postMessage(
          {
            type: 'slides',
            html: slides.join('\n'),
            title,
            theme: THEME_DEFAULTS,
            activeSlide,
          },
          '*',
        );
      } catch {
        // Ignore parse errors while user is editing
      }
    });
  }, []);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'preview-ready') {
        previewReady.current = true;
        sendToPreview(pendingSource.current ?? source);
        pendingSource.current = null;
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sendToPreview, source]);

  useEffect(() => {
    const timer = setTimeout(() => sendToPreview(source), 300);
    return () => clearTimeout(timer);
  }, [source, sendToPreview]);

  const lineCount = source.split('\n').length;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--surface)',
      color: 'var(--text)',
      overflow: 'hidden',
    }}>

      {/* ─── Top nav ─── */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 48,
        flexShrink: 0,
        padding: '0 20px',
        background: 'var(--surface-raised)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            background: 'var(--accent-glow)',
            border: '1px solid var(--border)',
          }}>
            <IconChart1 size={16} color="var(--accent)" />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--accent)' }}>
            lets-talk-about
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            //&nbsp;markdown&nbsp;&rarr;&nbsp;slides
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <a
            href="https://github.com/tamino-martinius/lets-talk-about"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, fontSize: 11 }}
          >
            <IconGithub size={14} />
            github
          </a>
          <a
            href="https://www.npmjs.com/package/lets-talk-about"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, fontSize: 11 }}
          >
            <IconNpm size={14} />
            npm
          </a>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 6px' }} />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 11,
            color: 'var(--text-faint)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}>
            <IconConsoleSimple size={12} />
            npx lets-talk-about init
          </div>
        </div>
      </nav>

      {/* ─── Main content: editor (left) | preview (right) ─── */}
      <main style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
      }}>

        {/* Left — Editor */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          width: '50%',
          borderRight: '1px solid var(--border)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 32,
            flexShrink: 0,
            padding: '0 16px',
            background: 'var(--surface-raised)',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent)' }}>
              <IconMarkdown size={13} />
              slides.md
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
              {lineCount} ln
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor value={source} onChange={setSource} onCursorLine={handleCursorLine} />
          </div>
        </div>

        {/* Right — Preview */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          width: '50%',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 32,
            flexShrink: 0,
            padding: '0 16px',
            background: 'var(--surface-raised)',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent)' }}>
              <IconPreview size={13} />
              preview
            </span>
            {slideCount > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-faint)' }}>
                <IconSlidesWide size={11} />
                {slideCount}
              </span>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#000' }}>
            <iframe
              ref={iframeRef}
              src="/preview"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              title="Slide preview"
            />
          </div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 32,
        flexShrink: 0,
        padding: '0 20px',
        background: 'var(--surface-raised)',
        borderTop: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
          MIT &middot; Tamino Martinius
        </span>
        <a
          href="/legal"
          className="nav-link"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}
        >
          <IconLaw size={11} />
          legal / imprint
        </a>
      </footer>
    </div>
  );
}
