import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/languages/definitions/python/register.js';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.editor.defineTheme('step-dark', {
  base: 'vs-dark', inherit: true,
  rules: [{ token: 'comment', foreground: '788391' }, { token: 'string', foreground: 'ADCCA2' }, { token: 'keyword', foreground: 'BEA7EE' }, { token: 'number', foreground: 'E7C18B' }],
  colors: { 'editor.background': '#171b22', 'editor.lineHighlightBackground': '#202630', 'editorLineNumber.foreground': '#657082', 'editorLineNumber.activeForeground': '#d1d9e6', 'editorCursor.foreground': '#9daeff', 'editor.selectionBackground': '#354b70' },
});
export function createCodeEditor(container: HTMLElement, value: string, theme: string, fontSize: number, change: (code: string) => void, run: () => void, submit: () => void) {
  const editor = monaco.editor.create(container, {
    value, language: 'python', theme: theme === 'dark' ? 'step-dark' : 'vs', fontSize,
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    lineHeight: 26, minimap: { enabled: false }, automaticLayout: true,
    scrollBeyondLastLine: false, padding: { top: 22, bottom: 22 },
    tabSize: 4, insertSpaces: true, detectIndentation: false,
    autoIndent: 'full', autoClosingBrackets: 'always', autoClosingQuotes: 'always',
    renderLineHighlight: 'all', overviewRulerLanes: 0, hideCursorInOverviewRuler: true,
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    wordWrap: 'off', ariaLabel: 'Python 코드 편집기',
    quickSuggestions: false, fixedOverflowWidgets: true,
  });
  const subscription = editor.onDidChangeModelContent(() => change(editor.getValue()));
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, submit);
  return {
    getValue: () => editor.getValue(),
    setValue: (code: string) => editor.setValue(code),
    setTheme: (value: string) => monaco.editor.setTheme(value === 'dark' ? 'step-dark' : 'vs'),
    setFontSize: (value: number) => editor.updateOptions({ fontSize: value }),
    focus: () => editor.focus(),
    insert: (value: string) => { const selection = editor.getSelection(); if (selection) editor.executeEdits('toolbar', [{ range: selection, text: value, forceMoveMarkers: true }]); editor.focus(); },
    dispose: () => { subscription.dispose(); const model = editor.getModel(); editor.dispose(); model?.dispose(); },
  };
}
export type CodeEditor = ReturnType<typeof createCodeEditor>;
