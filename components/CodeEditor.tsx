'use client';

import Editor, { type Monaco, type OnMount, type BeforeMount } from '@monaco-editor/react';
import type { editor, languages, IRange } from 'monaco-editor';
import { useCallback } from 'react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCursorLine?: (line: number) => void;
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

export default function CodeEditor({ value, onChange, onCursorLine }: CodeEditorProps) {
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    monaco.editor.defineTheme(THEME_NAME, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '555555', fontStyle: 'italic' },
        { token: 'keyword', foreground: '66cc66' },
        { token: 'string', foreground: '88c070' },
        { token: 'number', foreground: '66cc66' },
        { token: 'type', foreground: '66cc66' },
        { token: '', foreground: 'd4d4d4' },
      ],
      colors: {
        'editor.background': '#0c0c0c',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#141414',
        'editor.selectionBackground': '#66cc6633',
        'editorCursor.foreground': '#66cc66',
        'editor.selectionHighlightBackground': '#66cc6622',
        'editorLineNumber.foreground': '#333',
        'editorLineNumber.activeForeground': '#666',
        'editorIndentGuide.background': '#1a1a1a',
        'editorIndentGuide.activeBackground': '#333',
        'editorWidget.background': '#141414',
        'editorWidget.border': '#222',
        'editorSuggestWidget.background': '#141414',
        'editorSuggestWidget.border': '#222',
        'editorSuggestWidget.selectedBackground': '#1a1a1a',
        'editorSuggestWidget.highlightForeground': '#66cc66',
        'scrollbarSlider.background': '#22222233',
        'scrollbarSlider.hoverBackground': '#33333344',
        'scrollbarSlider.activeBackground': '#44444455',
      },
    });
  }, []);

  const handleMount: OnMount = useCallback((editorInstance, monaco) => {
    monaco.languages.registerCompletionItemProvider('markdown', {
      triggerCharacters: ['-', ':', '#'],
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
