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
  const [buildStep, setBuildStep] = useState(0);
  const [totalBuildSteps, setTotalBuildSteps] = useState(0);

  const updateNotes = useCallback((slideIndex: number) => {
    const note = notesMap.current[String(slideIndex)] || '';
    setNotes(note);
  }, []);

  // Send navigate message to current iframe (build-step aware)
  const navigateStep = useCallback((delta: number) => {
    currentIframeRef.current?.contentWindow?.postMessage(
      { type: 'navigate', delta },
      '*',
    );
  }, []);

  // Send navigate-slide message to current iframe (skip build steps)
  const navigateSlide = useCallback((delta: number) => {
    currentIframeRef.current?.contentWindow?.postMessage(
      { type: 'navigate-slide', delta },
      '*',
    );
  }, []);

  const sendSlidesToIframe = useCallback((iframe: HTMLIFrameElement | null, msg: SlideMessage, activeSlide: number) => {
    const win = iframe?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: 'slides', html: msg.html, title: msg.title, theme: msg.theme, activeSlide },
      '*',
    );
  }, []);

  const handleSlidesMessage = useCallback((msg: SlideMessage) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = msg.html;
    const count = tmp.querySelectorAll('article').length;
    slideCountRef.current = count;
    setSlideCount(count);

    notesMap.current = msg.notes || {};

    const startSlide = msg.activeSlide ?? 0;
    setCurSlide(startSlide);
    updateNotes(startSlide);

    pendingSlides.current = msg;

    if (currentReady.current) {
      sendSlidesToIframe(currentIframeRef.current, msg, startSlide);
      // Enable presenter preview (faded upcoming items) on current iframe
      setTimeout(() => {
        currentIframeRef.current?.contentWindow?.postMessage(
          { type: 'set-presenter-preview', enabled: true },
          '*',
        );
      }, 50);
    }
    if (nextReady.current) {
      const nextIndex = Math.min(startSlide + 1, count - 1);
      sendSlidesToIframe(nextIframeRef.current, msg, nextIndex);
      // Next iframe shows all build items
      setTimeout(() => {
        nextIframeRef.current?.contentWindow?.postMessage(
          { type: 'goto-slide', index: nextIndex, revealAll: true },
          '*',
        );
      }, 50);
    }

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
            setTimeout(() => {
              currentIframeRef.current?.contentWindow?.postMessage(
                { type: 'set-presenter-preview', enabled: true },
                '*',
              );
            }, 50);
          }
        } else if (e.source === nextIframeRef.current?.contentWindow) {
          nextReady.current = true;
          if (pendingSlides.current) {
            const slide = pendingSlides.current.activeSlide ?? 0;
            const nextIndex = Math.min(slide + 1, slideCountRef.current - 1);
            sendSlidesToIframe(nextIframeRef.current, pendingSlides.current, nextIndex);
            setTimeout(() => {
              nextIframeRef.current?.contentWindow?.postMessage(
                { type: 'goto-slide', index: nextIndex, revealAll: true },
                '*',
              );
            }, 50);
          }
        }
        return;
      }

      if (e.data.type === 'slides') {
        handleSlidesMessage(e.data as SlideMessage);
        return;
      }

      // Build state reported by current iframe
      if (e.data.type === 'build-state' && e.source === currentIframeRef.current?.contentWindow) {
        const { slide, buildStep: step, totalBuildSteps: total } = e.data;
        setBuildStep(step);
        setTotalBuildSteps(total);
        // Forward build step to viewers
        channelRef.current?.postMessage({ type: 'sync', slide, buildStep: step });
        return;
      }

      // Slide navigation from current iframe
      if (e.data.type === 'slide-changed' && e.source === currentIframeRef.current?.contentWindow) {
        const idx = e.data.index as number;
        setCurSlide(idx);
        updateNotes(idx);
        // Update next iframe to show the slide after current, with all builds revealed
        const nextIndex = Math.min(idx + 1, slideCountRef.current - 1);
        nextIframeRef.current?.contentWindow?.postMessage(
          { type: 'goto-slide', index: nextIndex, revealAll: true },
          '*',
        );
        channelRef.current?.postMessage({ type: 'sync', slide: idx, buildStep: e.data.buildStep ?? 0 });
      }
    }

    window.addEventListener('message', handleMessage);
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
        const { slide, buildStep: step } = event.data;
        const clamped = Math.max(0, Math.min(slide, slideCountRef.current - 1));
        setCurSlide(clamped);
        updateNotes(clamped);
        currentIframeRef.current?.contentWindow?.postMessage(
          { type: 'goto-slide', index: clamped },
          '*',
        );
        if (step !== undefined) {
          setTimeout(() => {
            currentIframeRef.current?.contentWindow?.postMessage(
              { type: 'set-build-step', step },
              '*',
            );
          }, 20);
        }
        const nextIndex = Math.min(clamped + 1, slideCountRef.current - 1);
        nextIframeRef.current?.contentWindow?.postMessage(
          { type: 'goto-slide', index: nextIndex, revealAll: true },
          '*',
        );
      }
      if (event.data.type === 'request-state') {
        channel.postMessage({ type: 'sync', slide: curSlide, buildStep });
      }
      if (event.data.type === 'request-slides' && pendingSlides.current) {
        channel.postMessage({
          type: 'slides-data',
          html: pendingSlides.current.html,
          title: pendingSlides.current.title,
          theme: pendingSlides.current.theme,
        });
      }
    };

    return () => channel.close();
  }, [updateNotes, curSlide, buildStep]);

  // Timer
  useEffect(() => {
    const id = setInterval(() => {
      setTimer(formatTime(Date.now() - startTimeRef.current));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Keyboard — arrows advance build steps, PageUp/PageDown skip full slides
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'Enter':
          navigateStep(1);
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'Backspace':
          navigateStep(-1);
          e.preventDefault();
          break;
        case 'PageDown':
          navigateSlide(1);
          e.preventDefault();
          break;
        case 'PageUp':
          navigateSlide(-1);
          e.preventDefault();
          break;
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigateStep, navigateSlide]);

  function openViewer() {
    const win = window.open('/preview', '_blank');
    if (!win) alert('Popup blocked. Please allow popups for this site.');
  }

  const btnStyle = {
    background: 'var(--presenter-button-bg)',
    color: 'var(--presenter-button-text)',
    border: '1px solid var(--presenter-button-border)',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 13,
    cursor: 'pointer',
    lineHeight: 1,
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--presenter-bg)',
      color: 'var(--presenter-text)',
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
        <div style={{ position: 'relative', background: 'var(--presenter-slide-bg)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: 8, left: 12, zIndex: 10,
            fontSize: 11, color: 'var(--presenter-label)', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>Current</div>
          <iframe
            ref={currentIframeRef}
            src="/preview"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            title="Current slide"
          />
        </div>

        {/* Next slide */}
        <div style={{ position: 'relative', background: 'var(--presenter-slide-bg)', borderRadius: 8, overflow: 'hidden', opacity: 0.6 }}>
          <div style={{
            position: 'absolute', top: 8, left: 12, zIndex: 10,
            fontSize: 11, color: 'var(--presenter-label)', textTransform: 'uppercase', letterSpacing: '0.05em',
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
          background: 'var(--presenter-notes-bg)',
          borderTop: '1px solid var(--presenter-notes-border)',
          fontSize: 16,
          lineHeight: 1.6,
          color: 'var(--presenter-notes-text)',
        }}
        dangerouslySetInnerHTML={notes ? { __html: notes } : undefined}
      >
        {!notes && <span style={{ color: 'var(--presenter-notes-placeholder)', fontStyle: 'italic' }}>No notes for this slide</span>}
      </div>

      {/* Controls bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '10px 20px',
        background: 'var(--presenter-controls-bg)',
        borderTop: '1px solid var(--presenter-controls-border)',
        userSelect: 'none',
      }}>
        {/* Slide-level navigation */}
        <button onClick={() => navigateSlide(-1)} style={btnStyle} title="Previous slide (PageUp)">
          &#9664;&#9664;
        </button>
        {/* Step-level navigation */}
        <button onClick={() => navigateStep(-1)} style={btnStyle} title="Previous step (Arrow Left)">
          &#9664;
        </button>

        {/* Status display */}
        <span style={{
          fontSize: 13, fontWeight: 600, minWidth: 120, textAlign: 'center',
          color: 'var(--presenter-counter)', whiteSpace: 'nowrap',
        }}>
          {slideCount > 0 ? `${curSlide + 1} / ${slideCount}` : '\u2014'}
          {totalBuildSteps > 0 && (
            <span style={{ color: 'var(--presenter-timer)', marginLeft: 8 }}>
              {'\u2022'} {buildStep}/{totalBuildSteps}
            </span>
          )}
        </span>

        {/* Step-level navigation */}
        <button onClick={() => navigateStep(1)} style={btnStyle} title="Next step (Arrow Right)">
          &#9654;
        </button>
        {/* Slide-level navigation */}
        <button onClick={() => navigateSlide(1)} style={btnStyle} title="Next slide (PageDown)">
          &#9654;&#9654;
        </button>

        <span style={{
          fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          color: 'var(--presenter-timer)', minWidth: 100, textAlign: 'center',
          marginLeft: 8,
        }}>
          {timer}
        </span>
        <button
          onClick={openViewer}
          style={{
            marginLeft: 'auto',
            background: 'var(--presenter-viewer-bg)', color: 'var(--presenter-viewer-text)', border: '1px solid var(--presenter-viewer-border)',
            borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer',
          }}
        >
          + Viewer
        </button>
      </div>
    </div>
  );
}
