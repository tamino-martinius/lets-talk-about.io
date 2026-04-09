'use client';

import { useEffect, useRef } from 'react';

interface SlideMessage {
  type: 'slides';
  html: string;
  title: string;
  theme: Record<string, string>;
  activeSlide?: number;
}

interface GotoSlideMessage {
  type: 'goto-slide';
  index: number;
}

const SLIDE_CLASSES = ['far-past', 'past', 'current', 'next', 'far-next'];
const CHANNEL_NAME = 'lets-talk-about:presenter';

function applySlideClasses(articles: HTMLElement[], curSlide: number) {
  for (let i = 0; i < articles.length; i++) {
    for (const cls of SLIDE_CLASSES) articles[i].classList.remove(cls);
    switch (i - curSlide) {
      case -2: articles[i].classList.add('far-past'); break;
      case -1: articles[i].classList.add('past'); break;
      case 0:  articles[i].classList.add('current'); break;
      case 1:  articles[i].classList.add('next'); break;
      case 2:  articles[i].classList.add('far-next'); break;
    }
  }
}

function processBackgrounds(container: HTMLElement) {
  for (const article of container.querySelectorAll<HTMLElement>('article[data-background]')) {
    const bg = article.getAttribute('data-background');
    if (bg) {
      article.style.backgroundImage = `url('${bg}')`;
      article.classList.add('image');
      if (article.getAttribute('data-cover') === 'true') {
        article.classList.add('cover');
      }
    }
  }
}

function setupMermaidLazyLoading(section: HTMLElement) {
  const mermaidEls = section.querySelectorAll<HTMLElement>('pre.mermaid');
  if (!mermaidEls.length) return;

  import('mermaid').then(({ default: mermaid }) => {
    const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--color-theme').trim();
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: { primaryColor: themeColor },
    });

    // Use IntersectionObserver to render mermaid diagrams when they become visible
    const renderedElements = new WeakSet<HTMLElement>();
    const observer = new IntersectionObserver(
      async (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !renderedElements.has(entry.target as HTMLElement)) {
            const element = entry.target as HTMLElement;
            renderedElements.add(element);

            try {
              await mermaid.run({ nodes: [element] });
            } catch (error) {
              console.error('Failed to render mermaid diagram:', error);
            }

            observer.unobserve(element);
          }
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100% 0px 100% 0px'
      }
    );

    mermaidEls.forEach(el => observer.observe(el));
  });
}

export default function PreviewRenderer() {
  const sectionRef = useRef<HTMLElement>(null);
  const curSlideRef = useRef(0);
  const articlesRef = useRef<HTMLElement[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const suppressBroadcast = useRef(false);

  useEffect(() => {
    const isStandalone = window === window.parent;

    // Set up BroadcastChannel for standalone viewer mode
    if (isStandalone) {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;

      channel.onmessage = (event) => {
        if (event.data.type === 'sync') {
          const articles = articlesRef.current;
          if (!articles.length) return;
          const clamped = Math.max(0, Math.min(event.data.slide, articles.length - 1));
          suppressBroadcast.current = true;
          curSlideRef.current = clamped;
          applySlideClasses(articles, clamped);
        }
        if (event.data.type === 'request-state') {
          channelRef.current?.postMessage({ type: 'sync', slide: curSlideRef.current, buildStep: 0 });
        }
        if (event.data.type === 'slides-data') {
          // Received slides data from presenter - render directly
          const section = sectionRef.current;
          if (!section) return;

          const msg = event.data as { html: string; title: string; theme: Record<string, string> };

          // Apply CSS variables
          const root = document.documentElement;
          for (const [key, value] of Object.entries(msg.theme)) {
            const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
            root.style.setProperty(cssVar, value);
          }

          // Render slides
          section.innerHTML = msg.html;
          document.title = msg.title;

          // Track articles
          const articles = Array.from(section.querySelectorAll<HTMLElement>('article'));
          articlesRef.current = articles;
          curSlideRef.current = 0;

          processBackgrounds(section);
          if (articles.length) applySlideClasses(articles, 0);
          setupMermaidLazyLoading(section);

          document.body.classList.add('loaded');
        }
      };

      // Request slides data and current state from peers
      channel.postMessage({ type: 'request-slides' });
      channel.postMessage({ type: 'request-state' });
    }

    function navigate(delta: number) {
      const articles = articlesRef.current;
      if (!articles.length) return;
      const next = curSlideRef.current + delta;
      if (next < 0 || next >= articles.length) return;
      curSlideRef.current = next;
      applySlideClasses(articles, next);
      window.parent.postMessage({ type: 'slide-changed', index: next }, '*');

      // Broadcast sync in standalone mode
      if (isStandalone && channelRef.current) {
        channelRef.current.postMessage({ type: 'sync', slide: next, buildStep: 0 });
      }
    }

    function gotoSlide(index: number) {
      const articles = articlesRef.current;
      if (!articles.length) return;
      const clamped = Math.max(0, Math.min(index, articles.length - 1));
      curSlideRef.current = clamped;
      applySlideClasses(articles, clamped);
    }

    function handleMessage(e: MessageEvent) {
      if (!e.data) return;

      if (e.data.type === 'goto-slide') {
        const msg = e.data as GotoSlideMessage;
        gotoSlide(msg.index);
        return;
      }

      if (e.data.type !== 'slides') return;
      const msg = e.data as SlideMessage;
      const section = sectionRef.current;
      if (!section) return;

      // Apply CSS variables
      const root = document.documentElement;
      for (const [key, value] of Object.entries(msg.theme)) {
        const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
        root.style.setProperty(cssVar, value);
      }

      // Render slides
      section.innerHTML = msg.html;
      document.title = msg.title;

      // Track articles and set initial slide
      const articles = Array.from(section.querySelectorAll<HTMLElement>('article'));
      articlesRef.current = articles;

      const startSlide = msg.activeSlide ?? 0;
      curSlideRef.current = startSlide;

      processBackgrounds(section);
      if (articles.length) applySlideClasses(articles, startSlide);
      setupMermaidLazyLoading(section);

      document.body.classList.add('loaded');
    }

    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'Enter':
        case 'PageDown':
          navigate(1);
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'Backspace':
        case 'PageUp':
          navigate(-1);
          e.preventDefault();
          break;
      }
    }

    function handleClick(e: MouseEvent) {
      const x = e.clientX / window.innerWidth;
      if (x < 0.3) navigate(-1);
      else if (x > 0.7) navigate(1);
    }

    window.addEventListener('message', handleMessage);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClick);

    // Tell parent we're ready
    window.parent.postMessage({ type: 'preview-ready' }, '*');

    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClick);
      channelRef.current?.close();
    };
  }, []);

  return <section ref={sectionRef} className="slides layout-regular template-default" />;
}
