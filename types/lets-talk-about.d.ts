declare module 'lets-talk-about/compiler' {
  interface CompileConfig {
    title?: string;
    theme?: Record<string, string>;
    layout?: Record<string, string> | ((slideNumber: number, totalSlides: number) => Record<string, string>);
    templates?: Record<string, (slots: Record<string, string>) => string>;
    styles?: string;
    base?: string;
  }

  interface CompileResult {
    title: string;
    slides: string[];
  }

  export function compile(source: string, config?: CompileConfig): CompileResult;
  export function buildHTML(source: string, config?: CompileConfig): string;
}

declare module 'lets-talk-about/client/slides' {
  export function init(): void;
}
