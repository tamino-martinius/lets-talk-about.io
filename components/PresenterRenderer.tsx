'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface SlideMessage {
  type: 'slides';
  html: string;
  title: string;
  theme: Record<string, string>;
  activeSlide?: number;
  notes?: Record<string, string>;
}

const CHANNEL_NAME = 'lets-talk-about:presenter';

function formatTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function PresenterRenderer() {
  const currentIframeRef = useRef<HTMLIFrameElement>(null);
  const nextIframeRef = useRef<HTMLIFrameElement>(null);
  const currentReady = useRef(false);
  const nextReady = useRef(false);
  const pendingSlides = useRef<SlideMessage | null>(null);
  const notesMap = useRef<Record<string, string>>({});
  const slideCountRef = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const startTimeRef = useRef(Date.now());

  const [curSlide, setCurSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [notes, setNotes] = useState('');
  const [timer, setTimer] = useState('00:00:00');

  const updateNotes = useCallback((slideIndex: number) => {
    const note = notesMap.current[String(slideIndex)] || '';
    setNotes(note);
  }, []);

  const gotoSlide = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, slideCountRef.current - 1));
    setCurSlide(clamped);
    updateNotes(clamped);

    // Send goto-slide to current iframe
    currentIframeRef.current?.contentWindow?.postMessage(
      { type: 'goto-slide', index: clamped },
      '*',
    );
    // Send next slide's index to next iframe
    const nextIndex = Math.min(clamped + 1, slideCountRef.current - 1);
    nextIframeRef.current?.contentWindow?.postMessage(
      { type: 'goto-slide', index: nextIndex },
      '*',
    );

    // Broadcast sync
    channelRef.current?.postMessage({ type: 'sync', slide: clamped, buildStep: 0 });
  }, [updateNotes]);

  const sendSlidesToIframe = useCallback((iframe: HTMLIFrameElement | null, msg: SlideMessage, activeSlide: number) => {
    const win = iframe?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: 'slides', html: msg.html, title: msg.title, theme: msg.theme, activeSlide },
      '*',
    );
  }, []);

  const handleSlidesMessage = useCallback((msg: SlideMessage) => {
    // Count articles in the HTML
    const tmp = document.createElement('div');
    tmp.innerHTML = msg.html;
    const count = tmp.querySelectorAll('article').length;
    slideCountRef.current = count;
    setSlideCount(count);

    // Store notes
    notesMap.current = msg.notes || {};

    const startSlide = msg.activeSlide ?? 0;
    setCurSlide(startSlide);
    updateNotes(startSlide);

    pendingSlides.current = msg;

    if (currentReady.current) {
      sendSlidesToIframe(currentIframeRef.current, msg, startSlide);
    }
    if (nextReady.current) {
      const nextIndex = Math.min(startSlide + 1, count - 1);
      sendSlidesToIframe(nextIframeRef.current, msg, nextIndex);
    }

    // Broadcast slides update to standalone viewers
    channelRef.current?.postMessage({
      type: 'slides-data',
      html: msg.html,
      title: msg.title,
      theme: msg.theme,
    });
  }, [sendSlidesToIframe, updateNotes]);

  // Message handler
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data?.type) return;

      if (e.data.type === 'preview-ready') {
        if (e.source === currentIframeRef.current?.contentWindow) {
          currentReady.current = true;
          if (pendingSlides.current) {
            const slide = pendingSlides.current.activeSlide ?? 0;
            sendSlidesToIframe(currentIframeRef.current, pendingSlides.current, slide);
          }
        } else if (e.source === nextIframeRef.current?.contentWindow) {
          nextReady.current = true;
          if (pendingSlides.current) {
            const slide = pendingSlides.current.activeSlide ?? 0;
            const nextIndex = Math.min(slide + 1, slideCountRef.current - 1);
            sendSlidesToIframe(nextIframeRef.current, pendingSlides.current, nextIndex);
          }
        }
        return;
      }

      if (e.data.type === 'slides') {
        handleSlidesMessage(e.data as SlideMessage);
        return;
      }

      // Slide navigation from current iframe
      if (e.data.type === 'slide-changed' && e.source === currentIframeRef.current?.contentWindow) {
        const idx = e.data.index as number;
        setCurSlide(idx);
        updateNotes(idx);
        const nextIndex = Math.min(idx + 1, slideCountRef.current - 1);
        nextIframeRef.current?.contentWindow?.postMessage(
          { type: 'goto-slide', index: nextIndex },
          '*',
        );
        channelRef.current?.postMessage({ type: 'sync', slide: idx, buildStep: 0 });
      }
    }

    window.addEventListener('message', handleMessage);
    // Tell opener (or parent if in iframe) we're ready
    const target = window.opener || window.parent;
    if (target && target !== window) {
      target.postMessage({ type: 'preview-ready' }, '*');
    }

    return () => window.removeEventListener('message', handleMessage);
  }, [handleSlidesMessage, sendSlidesToIframe, updateNotes]);

  // BroadcastChannel for viewer sync
  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event) => {
      if (event.data.type === 'sync') {
        const { slide, buildStep } = event.data;
        const clamped = Math.max(0, Math.min(slide, slideCountRef.current - 1));
        setCurSlide(clamped);
        updateNotes(clamped);
        currentIframeRef.current?.contentWindow?.postMessage(
          { type: 'goto-slide', index: clamped },
          '*',
        );
        const nextIndex = Math.min(clamped + 1, slideCountRef.current - 1);
        nextIframeRef.current?.contentWindow?.postMessage(
          { type: 'goto-slide', index: nextIndex },
          '*',
        );
      }
      if (event.data.type === 'request-state') {
        channel.postMessage({ type: 'sync', slide: curSlide, buildStep: 0 });
      }
      if (event.data.type === 'request-slides' && pendingSlides.current) {
        // Send full slides data to newly opened viewer
        channel.postMessage({
          type: 'slides-data',
          html: pendingSlides.current.html,
          title: pendingSlides.current.title,
          theme: pendingSlides.current.theme,
        });
      }
    };

    return () => channel.close();
  }, [updateNotes, curSlide]);

  // Timer
  useEffect(() => {
    const id = setInterval(() => {
      setTimer(formatTime(Date.now() - startTimeRef.current));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Keyboard
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'Enter':
        case 'PageDown':
          gotoSlide(curSlide + 1);
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'Backspace':
        case 'PageUp':
          gotoSlide(curSlide - 1);
          e.preventDefault();
          break;
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [curSlide, gotoSlide]);

  function openViewer() {
    const win = window.open('/preview', '_blank');
    if (!win) alert('Popup blocked. Please allow popups for this site.');
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#1a1a1a',
      color: '#eee',
      fontFamily: 'Arial, Helvetica, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Slide panes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
        gap: 12,
        padding: 12,
        flex: 1,
        minHeight: 0,
      }}>
        {/* Current slide */}
        <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: 8, left: 12, zIndex: 10,
            fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>Current</div>
          <iframe
            ref={currentIframeRef}
            src="/preview"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            title="Current slide"
          />
        </div>

        {/* Next slide */}
        <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', opacity: 0.6 }}>
          <div style={{
            position: 'absolute', top: 8, left: 12, zIndex: 10,
            fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>Next</div>
          <iframe
            ref={nextIframeRef}
            src="/preview"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
            title="Next slide"
          />
        </div>
      </div>

      {/* Notes */}
      <div
        className="presenter-notes-display"
        style={{
          maxHeight: 200,
          overflowY: 'auto',
          padding: '12px 20px',
          background: '#222',
          borderTop: '1px solid #333',
          fontSize: 16,
          lineHeight: 1.6,
          color: '#ccc',
        }}
        dangerouslySetInnerHTML={notes ? { __html: notes } : undefined}
      >
        {!notes && <span style={{ color: '#555', fontStyle: 'italic' }}>No notes for this slide</span>}
      </div>

      {/* Controls bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '10px 20px',
        background: '#111',
        borderTop: '1px solid #333',
        userSelect: 'none',
      }}>
        <button
          onClick={() => gotoSlide(curSlide - 1)}
          style={{
            background: '#333', color: '#eee', border: '1px solid #444',
            borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer',
          }}
        >
          &#9664; Prev
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 80, textAlign: 'center', color: '#aaa' }}>
          {slideCount > 0 ? `${curSlide + 1} / ${slideCount}` : '—'}
        </span>
        <button
          onClick={() => gotoSlide(curSlide + 1)}
          style={{
            background: '#333', color: '#eee', border: '1px solid #444',
            borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer',
          }}
        >
          Next &#9654;
        </button>
        <span style={{
          fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          color: '#6c6', minWidth: 100, textAlign: 'center',
        }}>
          {timer}
        </span>
        <button
          onClick={openViewer}
          style={{
            marginLeft: 'auto',
            background: '#2a3a2a', color: '#6c6', border: '1px solid #4a6a4a',
            borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer',
          }}
        >
          + Viewer
        </button>
      </div>
    </div>
  );
}
