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
  revealAll?: boolean;
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
      { threshold: 0.1, rootMargin: '100% 0px 100% 0px' },
    );

    mermaidEls.forEach(el => observer.observe(el));
  });
}

function makeBuildLists(articles: HTMLElement[]): HTMLElement[][] {
  const lists: HTMLElement[][] = new Array(articles.length);
  for (let i = 0; i < articles.length; i++) {
    lists[i] = [];
    const slide = articles[i];
    let selector = '.build > *';
    if (slide.classList.contains('build')) {
      selector += ':not(:first-child)';
    }
    for (const item of slide.querySelectorAll<HTMLElement>(selector)) {
      if (item.classList.contains('layout-region')) continue;
      if (item.classList.contains('presenter-notes')) continue;
      if (slide.classList.contains('build') && (item.tagName === 'UL' || item.tagName === 'OL')) {
        for (const li of Array.from(item.children) as HTMLElement[]) {
          li.classList.add('to-build');
          lists[i].push(li);
        }
      } else {
        item.classList.add('to-build');
        lists[i].push(item);
      }
    }
  }
  return lists;
}

export default function PreviewRenderer() {
  const sectionRef = useRef<HTMLElement>(null);
  const curSlideRef = useRef(0);
  const articlesRef = useRef<HTMLElement[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const suppressBroadcast = useRef(false);
  const buildItemsRef = useRef<HTMLElement[][]>([]);
  const buildStepRef = useRef(0);
  const furthestSlideRef = useRef(0);
  const presenterStyleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const isStandalone = window === window.parent;

    function reportBuildState() {
      const slide = curSlideRef.current;
      const items = buildItemsRef.current[slide];
      window.parent.postMessage({
        type: 'build-state',
        slide,
        buildStep: buildStepRef.current,
        totalBuildSteps: items ? items.length : 0,
      }, '*');
    }

    function setBuildStep(slideIndex: number, step: number) {
      const items = buildItemsRef.current[slideIndex];
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (i < step) {
          items[i].classList.remove('to-build');
        } else {
          items[i].classList.add('to-build');
        }
      }
      buildStepRef.current = step;
    }

    function revealAllBuildItems(slideIndex: number) {
      const items = buildItemsRef.current[slideIndex];
      if (!items) return;
      for (const item of items) item.classList.remove('to-build');
      buildStepRef.current = items.length;
    }

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
          setBuildStep(clamped, event.data.buildStep ?? 0);
        }
        if (event.data.type === 'request-state') {
          channelRef.current?.postMessage({ type: 'sync', slide: curSlideRef.current, buildStep: buildStepRef.current });
        }
        if (event.data.type === 'slides-data') {
          const section = sectionRef.current;
          if (!section) return;

          const msg = event.data as { html: string; title: string; theme: Record<string, string> };

          const root = document.documentElement;
          for (const [key, value] of Object.entries(msg.theme)) {
            const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
            root.style.setProperty(cssVar, value);
          }

          // Note: innerHTML is used here with compiler-generated HTML (not user input)
          section.innerHTML = msg.html;
          document.title = msg.title;

          const articles = Array.from(section.querySelectorAll<HTMLElement>('article'));
          articlesRef.current = articles;
          curSlideRef.current = 0;
          buildStepRef.current = 0;
          furthestSlideRef.current = 0;

          processBackgrounds(section);
          buildItemsRef.current = makeBuildLists(articles);
          if (articles.length) applySlideClasses(articles, 0);
          setupMermaidLazyLoading(section);

          document.body.classList.add('loaded');
        }
      };

      channel.postMessage({ type: 'request-slides' });
      channel.postMessage({ type: 'request-state' });
    }

    function navigate(delta: number): boolean {
      const articles = articlesRef.current;
      if (!articles.length) return false;

      // Forward: try to reveal next build item before advancing slide
      if (delta > 0) {
        const items = buildItemsRef.current[curSlideRef.current];
        if (items && buildStepRef.current < items.length) {
          items[buildStepRef.current].classList.remove('to-build');
          buildStepRef.current++;
          reportBuildState();
          if (isStandalone && channelRef.current) {
            channelRef.current.postMessage({ type: 'sync', slide: curSlideRef.current, buildStep: buildStepRef.current });
          }
          return false; // did not change slide
        }
      }

      const next = curSlideRef.current + delta;
      if (next < 0 || next >= articles.length) return false;
      curSlideRef.current = next;
      buildStepRef.current = 0;

      if (next > furthestSlideRef.current) {
        furthestSlideRef.current = next;
      }

      // If returning to a previously visited slide, show all build items
      if (next < furthestSlideRef.current) {
        revealAllBuildItems(next);
      }

      applySlideClasses(articles, next);
      window.parent.postMessage({ type: 'slide-changed', index: next }, '*');
      reportBuildState();

      if (isStandalone && channelRef.current) {
        channelRef.current.postMessage({ type: 'sync', slide: next, buildStep: buildStepRef.current });
      }
      return true; // slide changed
    }

    function navigateSlide(delta: number) {
      const articles = articlesRef.current;
      if (!articles.length) return;
      const next = curSlideRef.current + delta;
      if (next < 0 || next >= articles.length) return;
      curSlideRef.current = next;
      buildStepRef.current = 0;

      if (next > furthestSlideRef.current) {
        furthestSlideRef.current = next;
      }
      if (next < furthestSlideRef.current) {
        revealAllBuildItems(next);
      }

      applySlideClasses(articles, next);
      window.parent.postMessage({ type: 'slide-changed', index: next }, '*');
      reportBuildState();

      if (isStandalone && channelRef.current) {
        channelRef.current.postMessage({ type: 'sync', slide: next, buildStep: buildStepRef.current });
      }
    }

    function gotoSlide(index: number, revealAll?: boolean) {
      const articles = articlesRef.current;
      if (!articles.length) return;
      const clamped = Math.max(0, Math.min(index, articles.length - 1));
      curSlideRef.current = clamped;
      applySlideClasses(articles, clamped);

      if (revealAll) {
        revealAllBuildItems(clamped);
      } else {
        setBuildStep(clamped, 0);
      }
      reportBuildState();
    }

    function handleMessage(e: MessageEvent) {
      if (!e.data) return;

      if (e.data.type === 'goto-slide') {
        const msg = e.data as GotoSlideMessage;
        gotoSlide(msg.index, msg.revealAll);
        return;
      }

      if (e.data.type === 'navigate') {
        navigate(e.data.delta as number);
        return;
      }

      if (e.data.type === 'navigate-slide') {
        navigateSlide(e.data.delta as number);
        return;
      }

      if (e.data.type === 'set-build-step') {
        setBuildStep(curSlideRef.current, e.data.step as number);
        reportBuildState();
        return;
      }

      if (e.data.type === 'set-presenter-preview') {
        if (e.data.enabled && !presenterStyleRef.current) {
          const style = document.createElement('style');
          style.textContent = '.to-build { opacity: 0.25 !important; }';
          document.head.appendChild(style);
          presenterStyleRef.current = style;
        } else if (!e.data.enabled && presenterStyleRef.current) {
          presenterStyleRef.current.remove();
          presenterStyleRef.current = null;
        }
        return;
      }

      if (e.data.type !== 'slides') return;
      const msg = e.data as SlideMessage;
      const section = sectionRef.current;
      if (!section) return;

      const root = document.documentElement;
      for (const [key, value] of Object.entries(msg.theme)) {
        const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
        root.style.setProperty(cssVar, value);
      }

      // Note: innerHTML is used here with compiler-generated HTML (not user input)
      section.innerHTML = msg.html;
      document.title = msg.title;

      const articles = Array.from(section.querySelectorAll<HTMLElement>('article'));
      articlesRef.current = articles;

      const startSlide = msg.activeSlide ?? 0;
      curSlideRef.current = startSlide;
      buildStepRef.current = 0;
      furthestSlideRef.current = startSlide;

      processBackgrounds(section);
      buildItemsRef.current = makeBuildLists(articles);
      if (articles.length) applySlideClasses(articles, startSlide);
      setupMermaidLazyLoading(section);

      document.body.classList.add('loaded');
      reportBuildState();
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
      presenterStyleRef.current?.remove();
      channelRef.current?.close();
    };
  }, []);

  return <section ref={sectionRef} className="slides layout-regular template-default" />;
}
