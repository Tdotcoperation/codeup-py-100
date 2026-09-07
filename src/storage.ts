import type { StudyState, RecordEntry } from './types';
export const STORAGE_KEY = 'python-step:study:v1';
export const defaults = (): StudyState => ({ version: 1, lastProblem: 6001, records: {}, theme: 'dark', fontSize: 15, split: 43 });
export function readState(storage: Pick<Storage, 'getItem'> = localStorage): StudyState {
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    if (!raw || raw.version !== 1 || !raw.records || typeof raw.records !== 'object' || Array.isArray(raw.records)) return defaults();
    const state = defaults();
    if (Number.isInteger(raw.lastProblem) && raw.lastProblem >= 6001 && raw.lastProblem <= 6098) state.lastProblem = raw.lastProblem;
    if (['light', 'dark', 'system'].includes(raw.theme)) state.theme = raw.theme;
    if (Number.isFinite(raw.fontSize)) state.fontSize = Math.max(12, Math.min(24, raw.fontSize));
    if (Number.isFinite(raw.split)) state.split = Math.max(28, Math.min(65, raw.split));
    for (let id = 6001; id <= 6098; id++) {
      const value = raw.records[id];
      if (!value || typeof value !== 'object') continue;
      const entry: RecordEntry = {};
      for (const key of ['code','previousCode','lastSolvedAt','lastEditedAt'] as const) {
        if (typeof value[key] === 'string' && value[key].length <= 200_000) entry[key] = value[key];
      }
      entry.completed = value.completed === true;
      entry.viewedSolution = value.viewedSolution === true;
      entry.hintLevel = Number.isInteger(value.hintLevel) ? Math.max(0, Math.min(3, value.hintLevel)) : 0;
      entry.attempts = Number.isInteger(value.attempts) ? Math.max(0, value.attempts) : 0;
      state.records[id] = entry;
    }
    return state;
  } catch { return defaults(); }
}
export function writeState(state: StudyState, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
