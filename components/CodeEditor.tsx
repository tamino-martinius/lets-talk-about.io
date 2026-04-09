'use client';

import Editor, { type Monaco, type OnMount, type BeforeMount } from '@monaco-editor/react';
import type { editor, languages, IRange } from 'monaco-editor';
import { useCallback, useEffect, useRef } from 'react';
import type { editor as editorNs } from 'monaco-editor';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCursorLine?: (line: number) => void;
  gotoLine?: { line: number; token: number };
}

function buildSuggestions(
  monaco: Monaco,
  model: editor.ITextModel,
  position: { lineNumber: number; column: number },
): languages.CompletionList {
  const lineContent = model.getLineContent(position.lineNumber);
  const word = model.getWordUntilPosition(position);
  const range: IRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };

  const suggestions: languages.CompletionItem[] = [];

  if (lineContent.trim() === '' || lineContent.startsWith('-')) {
    suggestions.push({
      label: '--- (slide separator)',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: '---\n',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      documentation: 'Insert a slide separator',
    });
  }

  if (lineContent.trim() === '' || lineContent.startsWith('?')) {
    suggestions.push({
      label: '??? (presenter notes)',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: '???\n${1:Speaker notes here}\n',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      documentation: 'Presenter notes — visible in filmstrip, hidden from slides',
    });
  }

  const optionSnippets = [
    { label: 'type: section', insertText: 'type: section', doc: 'Section slide with theme background' },
    { label: 'build: true', insertText: 'build: true', doc: 'Progressive reveal for list items' },
    { label: 'background:', insertText: 'background: ${1:url}', doc: 'Background image URL' },
    { label: 'cover: true', insertText: 'cover: true', doc: 'Cover background sizing' },
    { label: 'template: two-column', insertText: 'template: two-column', doc: 'Two-column layout template' },
    { label: 'template: title-content', insertText: 'template: title-content', doc: 'Title and content template' },
    { label: 'class:', insertText: 'class: ${1:name}', doc: 'Custom CSS class' },
  ];
  for (const s of optionSnippets) {
    suggestions.push({
      label: s.label,
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: s.insertText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      documentation: s.doc,
    });
  }

  if (lineContent.startsWith(':') || lineContent.trim() === '') {
    const slotSnippets = [
      { label: '::right::', insertText: '::right::', doc: 'Right column slot (two-column template)' },
      { label: '::title::', insertText: '::title::', doc: 'Title slot (title-content template)' },
      { label: '::default::', insertText: '::default::', doc: 'Default content slot' },
    ];
    for (const s of slotSnippets) {
      suggestions.push({
        label: s.label,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: s.insertText,
        range,
        documentation: s.doc,
      });
    }
  }

  if (position.lineNumber <= 3 && lineContent.startsWith('-')) {
    suggestions.push({
      label: '--- frontmatter ---',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: '---\ntitle: ${1:My Presentation}\n---\n',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      documentation: 'YAML frontmatter block',
    });
  }

  suggestions.push(
    {
      label: '```lang linenums',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: '```${1:js} linenums\n${2:code}\n```',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      documentation: 'Code block with line numbers',
    },
    {
      label: '```lang linenums highlight',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: '```${1:js} linenums h${2:1}\n${3:code}\n```',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      documentation: 'Code block with line numbers and highlighting',
    },
  );

  return { suggestions };
}

// Custom dark theme matching the site's color scheme
const THEME_NAME = 'lets-talk-about';

/** Resolve a CSS custom property (including nested var() refs) to a hex color string. */
function cssColor(varName: string): string {
  const el = document.createElement('span');
  el.style.color = `var(${varName})`;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  el.remove();
  const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return computed;
  const hex = '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
  if (m[4] !== undefined) {
    return hex + Math.round(parseFloat(m[4]) * 255).toString(16).padStart(2, '0');
  }
  return hex;
}

/** Read a CSS variable value directly (for values already in hex like #rrggbbaa). */
function cssVar(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

export default function CodeEditor({ value, onChange, onCursorLine, gotoLine }: CodeEditorProps) {
  const editorRef = useRef<editorNs.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !gotoLine) return;
    ed.setPosition({ lineNumber: gotoLine.line, column: 1 });
    ed.revealLineInCenter(gotoLine.line);
  }, [gotoLine]);

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    const c = (v: string) => cssColor(v);
    const stripHash = (v: string) => cssColor(v).replace('#', '');

    monaco.editor.defineTheme(THEME_NAME, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: stripHash('--editor-comment'), fontStyle: 'italic' },
        { token: 'keyword', foreground: stripHash('--editor-keyword') },
        { token: 'string', foreground: stripHash('--editor-string') },
        { token: 'number', foreground: stripHash('--editor-number') },
        { token: 'type', foreground: stripHash('--editor-type') },
        { token: '', foreground: stripHash('--editor-default') },
      ],
      colors: {
        'editor.background': c('--editor-bg'),
        'editor.foreground': c('--editor-fg'),
        'editor.lineHighlightBackground': c('--editor-line-highlight'),
        'editor.selectionBackground': cssVar('--editor-selection'),
        'editorCursor.foreground': c('--editor-cursor'),
        'editor.selectionHighlightBackground': cssVar('--editor-selection-highlight'),
        'editorLineNumber.foreground': c('--editor-line-number'),
        'editorLineNumber.activeForeground': c('--editor-line-number-active'),
        'editorIndentGuide.background': c('--editor-indent-guide'),
        'editorIndentGuide.activeBackground': c('--editor-indent-guide-active'),
        'editorWidget.background': c('--editor-widget-bg'),
        'editorWidget.border': c('--editor-widget-border'),
        'editorSuggestWidget.background': c('--editor-widget-bg'),
        'editorSuggestWidget.border': c('--editor-widget-border'),
        'editorSuggestWidget.selectedBackground': c('--editor-suggest-selected'),
        'editorSuggestWidget.highlightForeground': c('--editor-suggest-highlight'),
        'scrollbarSlider.background': cssVar('--editor-scrollbar'),
        'scrollbarSlider.hoverBackground': cssVar('--editor-scrollbar-hover'),
        'scrollbarSlider.activeBackground': cssVar('--editor-scrollbar-active'),
      },
    });
  }, []);

  const handleMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance;

    monaco.languages.registerCompletionItemProvider('markdown', {
      triggerCharacters: ['-', ':', '#', '?'],
      provideCompletionItems(model: editor.ITextModel, position: { lineNumber: number; column: number }) {
        return buildSuggestions(monaco, model, position);
      },
    });

    if (onCursorLine) {
      editorInstance.onDidChangeCursorPosition((e) => {
        onCursorLine(e.position.lineNumber);
      });
    }

    editorInstance.focus();
  }, [onCursorLine]);

  return (
    <Editor
      defaultLanguage="markdown"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      theme={THEME_NAME}
      options={{
        fontFamily: "'Commit Mono', ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
        fontSize: 13,
        lineHeight: 20,
        letterSpacing: 0,
        minimap: { enabled: false },
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: 'gutter',
        bracketPairColorization: { enabled: true },
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        smoothScrolling: true,
        suggest: {
          showSnippets: true,
          showKeywords: true,
        },
        quickSuggestions: {
          other: true,
          strings: true,
          comments: true,
        },
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
        },
      }}
    />
  );
}
