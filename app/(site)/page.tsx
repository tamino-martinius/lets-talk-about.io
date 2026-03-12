'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { IconChart1 } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconChart1';
import { IconGithub } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconGithub';
import { IconNpm } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconNpm';
import { IconMarkdown } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconMarkdown';
import { IconPreview } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconPreview';
import { IconConsoleSimple } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconConsoleSimple';
import { IconSlidesWide } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconSlidesWide';
import { IconLaw } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconLaw';
import { IconNote1 } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconNote1';

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

???
Welcome the audience and introduce the topic.

---
type: section

# Getting Started

---

## Features

- Markdown-based slides
- Syntax highlighting
- Background images
- Build animations

???
Emphasize that everything is just markdown.

---
build: true

## Incremental Reveal

- First point
- Second point
- Third point
- Fourth point

???
Use build: true to reveal list items one by one.

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

const SLIDE_KEYS = new Set(['type', 'build', 'background', 'cover', 'class', 'template']);

function isSlideOptions(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lines = trimmed.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (!match) return false;
    if (!SLIDE_KEYS.has(match[1])) return false;
  }
  return true;
}

function extractNotes(source: string): { cleanSource: string; notes: Map<number, string> } {
  const notes = new Map<number, string>();
  const lines = source.split('\n');

  // Detect frontmatter
  let frontmatterEnd = 0;
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        frontmatterEnd = i + 1;
        break;
      }
    }
  }

  const frontmatter = lines.slice(0, frontmatterEnd).join('\n');
  const body = lines.slice(frontmatterEnd).join('\n');

  // Split on \n---\n
  const segments = body.split('\n---\n');
  const cleanSegments: string[] = [];

  for (const segment of segments) {
    // Track code fences to skip ??? inside them
    const segLines = segment.split('\n');
    let inFence = false;
    let noteStart = -1;

    for (let i = 0; i < segLines.length; i++) {
      const trimmed = segLines[i].trimStart();
      if (trimmed.startsWith('```')) {
        inFence = !inFence;
      }
      if (!inFence && segLines[i].trim() === '???') {
        noteStart = i;
        break;
      }
    }

    if (noteStart !== -1) {
      const slideContent = segLines.slice(0, noteStart).join('\n');
      const noteContent = segLines.slice(noteStart + 1).join('\n').trim();
      cleanSegments.push(slideContent);
      // Store note keyed by segment index (mapped to slide index below)
      if (noteContent) {
        cleanSegments[cleanSegments.length - 1] = slideContent;
        // Tag this segment index with its note
        notes.set(cleanSegments.length - 1, noteContent);
      }
    } else {
      cleanSegments.push(segment);
    }
  }

  // Rejoin clean body
  const cleanBody = cleanSegments.join('\n---\n');
  const cleanSource = frontmatter ? frontmatter + '\n' + cleanBody : cleanBody;

  // Now remap segment indices to compiler slide indices
  // Mirror compiler logic: skip empty, merge pure-option segments
  const remapped = new Map<number, string>();
  let slideIndex = 0;
  let pendingNotes: string[] = [];

  for (let i = 0; i < cleanSegments.length; i++) {
    const trimmed = cleanSegments[i].trim();
    const segNote = notes.get(i);

    if (!trimmed) {
      if (segNote) pendingNotes.push(segNote);
      continue;
    }

    if (isSlideOptions(trimmed)) {
      // Pure options block — not a slide, carry note forward
      if (segNote) pendingNotes.push(segNote);
      continue;
    }

    // This segment produces a slide
    if (segNote) pendingNotes.push(segNote);
    if (pendingNotes.length > 0) {
      remapped.set(slideIndex, pendingNotes.join('\n\n'));
      pendingNotes = [];
    }
    slideIndex++;
  }

  return { cleanSource, notes: remapped };
}

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
  const [notes, setNotes] = useState<Map<number, string>>(new Map());
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewReady = useRef(false);
  const pendingSource = useRef<string | null>(null);
  const cursorLineRef = useRef(1);
  const thumbnailRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const thumbnailReady = useRef<boolean[]>([]);
  const pendingSlidesRef = useRef<{ html: string; title: string; slides: string[] } | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const gotoSlide = useCallback((slideIndex: number) => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !previewReady.current) return;
    win.postMessage({ type: 'goto-slide', index: slideIndex }, '*');
  }, []);

  const handleCursorLine = useCallback((line: number) => {
    cursorLineRef.current = line;
    const slideIndex = getSlideAtLine(source, line);
    setActiveSlideIndex(slideIndex);
    gotoSlide(slideIndex);
  }, [source, gotoSlide]);

  const sendToThumbnails = useCallback((html: string, title: string, slides: string[]) => {
    for (let i = 0; i < slides.length; i++) {
      const win = thumbnailRefs.current[i]?.contentWindow;
      if (!win || !thumbnailReady.current[i]) continue;
      win.postMessage(
        { type: 'slides', html, title, theme: THEME_DEFAULTS, activeSlide: i },
        '*',
      );
    }
  }, []);

  const sendToPreview = useCallback((markdown: string) => {
    if (!iframeRef.current?.contentWindow || !previewReady.current) {
      pendingSource.current = markdown;
      return;
    }

    import('lets-talk-about/compiler').then(({ compile }) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;

      try {
        const { cleanSource, notes: extractedNotes } = extractNotes(markdown.trim());
        const config = { theme: THEME_DEFAULTS };
        const { title, slides } = compile(cleanSource, config);
        const html = slides.join('\n');

        setSlideCount(slides.length);
        setNotes(extractedNotes);

        const activeSlide = getSlideAtLine(markdown, cursorLineRef.current);
        setActiveSlideIndex(activeSlide);

        win.postMessage(
          { type: 'slides', html, title, theme: THEME_DEFAULTS, activeSlide },
          '*',
        );

        // Send to thumbnails
        pendingSlidesRef.current = { html, title, slides };
        sendToThumbnails(html, title, slides);
      } catch {
        // Ignore parse errors while user is editing
      }
    });
  }, [sendToThumbnails]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type !== 'preview-ready') return;

      // Check if this is the main iframe
      if (e.source === iframeRef.current?.contentWindow) {
        previewReady.current = true;
        sendToPreview(pendingSource.current ?? source);
        pendingSource.current = null;
        return;
      }

      // Check if this is a thumbnail iframe
      for (let i = 0; i < thumbnailRefs.current.length; i++) {
        if (e.source === thumbnailRefs.current[i]?.contentWindow) {
          thumbnailReady.current[i] = true;
          // Send pending slides to this thumbnail
          const pending = pendingSlidesRef.current;
          if (pending) {
            const win = thumbnailRefs.current[i]?.contentWindow;
            if (win) {
              win.postMessage(
                { type: 'slides', html: pending.html, title: pending.title, theme: THEME_DEFAULTS, activeSlide: i },
                '*',
              );
            }
          }
          return;
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sendToPreview, source]);

  useEffect(() => {
    const timer = setTimeout(() => sendToPreview(source), 300);
    return () => clearTimeout(timer);
  }, [source, sendToPreview]);

  const handleThumbnailClick = useCallback((slideIndex: number) => {
    setActiveSlideIndex(slideIndex);
    gotoSlide(slideIndex);
  }, [gotoSlide]);

  // Auto-scroll filmstrip to keep active thumbnail visible
  useEffect(() => {
    const container = filmstripRef.current;
    if (!container) return;
    const thumb = container.children[activeSlideIndex] as HTMLElement | undefined;
    if (!thumb) return;
    thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeSlideIndex]);

  // Memoize slide indices for filmstrip rendering
  const slideIndices = useMemo(() => Array.from({ length: slideCount }, (_, i) => i), [slideCount]);

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
            //&nbsp;code&nbsp;&rarr;&nbsp;slides
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

          {/* Main preview — aspect-ratio letterboxed */}
          <div style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            padding: 8,
          }}>
            <div style={{
              aspectRatio: '1100 / 750',
              maxWidth: '100%',
              maxHeight: '100%',
              width: '100%',
              position: 'relative',
            }}>
              <iframe
                ref={iframeRef}
                src="/preview"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                title="Slide preview"
              />
            </div>
          </div>

          {/* Filmstrip */}
          <div style={{
            height: 160,
            flexShrink: 0,
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-raised)',
          }}>
            <div
              ref={filmstripRef}
              className="filmstrip-scroll"
              style={{
                display: 'flex',
                gap: 12,
                padding: '12px 16px',
                overflowX: 'auto',
                overflowY: 'hidden',
                height: '100%',
                alignItems: 'flex-start',
              }}
            >
              {slideIndices.map((i) => (
                <div
                  key={i}
                  className="filmstrip-thumb"
                  onClick={() => handleThumbnailClick(i)}
                  style={{
                    width: 176,
                    height: 120,
                    flexShrink: 0,
                    borderRadius: 4,
                    overflow: 'hidden',
                    border: i === activeSlideIndex
                      ? '2px solid var(--accent)'
                      : '2px solid var(--border)',
                    boxShadow: i === activeSlideIndex
                      ? '0 0 8px var(--accent-glow)'
                      : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                >
                  <iframe
                    ref={(el) => { thumbnailRefs.current[i] = el; }}
                    src="/preview"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      pointerEvents: 'none',
                    }}
                    title={`Slide ${i + 1} thumbnail`}
                    tabIndex={-1}
                  />
                  {notes.get(i) && (
                    <>
                      <div className="filmstrip-note-icon">
                        <IconNote1 size={10} />
                      </div>
                      <div className="filmstrip-note-overlay">
                        {notes.get(i)}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
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
