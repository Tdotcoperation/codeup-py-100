export interface TestCase { input: string; output: string; hidden?: boolean; label?: string }
export interface Problem {
  id: number; title: string; sourceTitle: string; category: string; sourceCategory: string;
  sourceUrl: string; difficulty: '입문' | '기초' | '도전';
  description: string; inputDescription: string; outputDescription: string;
  examples: TestCase[]; tests: TestCase[]; hints: string[]; starterCode: string;
  strictJudge?: boolean;
  solution: { understanding: string; concept: string; steps: string[]; example: string; caution: string; code: string };
}
export interface RecordEntry {
  code?: string; previousCode?: string; completed?: boolean; viewedSolution?: boolean;
  hintLevel?: number; attempts?: number; lastSolvedAt?: string; lastEditedAt?: string;
}
export interface StudyState {
  version: 1; lastProblem: number; records: Record<string, RecordEntry>;
  theme: 'dark' | 'light' | 'system'; fontSize: number; split: number;
}
export interface PythonResult {
  stdout: string; stderr: string; duration: number;
  error?: { type: string; message: string; line: number | null; traceback: string };
}
