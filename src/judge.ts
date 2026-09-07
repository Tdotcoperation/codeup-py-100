export function normalizeOutput(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[\t ]+$/g, '')).join('\n').replace(/\n+$/, '');
}
export function isCorrect(actual: string, expected: string, strict = false): boolean {
  return strict ? actual === expected : normalizeOutput(actual) === normalizeOutput(expected);
}
