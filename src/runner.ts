import type { PythonResult } from './types';
export type RunnerStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';
export class PythonRunner {
  private worker?: Worker;
  private ready?: Promise<void>;
  private rejectReady?: (error: Error) => void;
  private rejectRun?: (error: Error) => void;
  private loadTimer?: ReturnType<typeof setTimeout>;
  private runTimer?: ReturnType<typeof setTimeout>;
  private busy = false;
  public status: RunnerStatus = 'idle';
  public version = '3';
  constructor(private changed: (status: RunnerStatus) => void = () => {}) {}
  private setStatus(status: RunnerStatus) { this.status = status; this.changed(status); }
  prepare(): Promise<void> {
    if (this.ready) return this.ready;
    this.setStatus('loading');
    const worker = new Worker('/python-worker.js', { type: 'module', name: 'python-sandbox' });
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      this.loadTimer = setTimeout(() => this.fail(new Error('Python 실행 환경을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.')), 60000);
      worker.onerror = () => this.fail(new Error('Python 실행 환경에 오류가 발생했습니다. 다시 시도해 주세요.'));
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') {
          clearTimeout(this.loadTimer);
          this.rejectReady = undefined;
          this.version = data.version;
          this.setStatus('ready');
          resolve();
        } else if (data.type === 'fatal') this.fail(new Error(data.message));
      };
      worker.postMessage({ type: 'init' });
    });
    return this.ready;
  }
  async run(code: string, input: string, timeout = 3000): Promise<PythonResult> {
    if (this.busy) throw new Error('이미 실행 중입니다.');
    if (code.length > 200000 || input.length > 1000000) throw new Error('코드 또는 입력이 너무 큽니다.');
    this.busy = true;
    try {
      await this.prepare();
      const worker = this.worker!;
      this.setStatus('running');
      return await new Promise<PythonResult>((resolve, reject) => {
        this.rejectRun = reject;
        this.runTimer = setTimeout(() => {
          this.disposeWorker();
          resolve({ stdout: '', stderr: '', duration: timeout, error: { type: 'TimeoutError', message: '실행 시간이 초과되었습니다.', line: null, traceback: `제한 시간 ${timeout / 1000}초를 초과하여 실행을 중단했습니다.` } });
        }, timeout);
        worker.onmessage = ({ data }) => {
          if (data.type === 'fatal') { this.fail(new Error(data.message)); return; }
          if (data.type !== 'result') return;
          this.disposeWorker();
          resolve(data.result);
        };
        worker.postMessage({ type: 'run', code, input });
      });
    } finally { this.busy = false; }
  }
  private disposeWorker() {
    clearTimeout(this.loadTimer); clearTimeout(this.runTimer);
    this.worker?.terminate(); this.worker = undefined; this.ready = undefined;
    this.rejectReady = undefined; this.rejectRun = undefined;
    this.setStatus('idle');
  }
  private fail(error: Error) {
    const load = this.rejectReady, run = this.rejectRun;
    this.disposeWorker(); this.setStatus('error');
    load?.(error); run?.(error);
  }
  cancel() { this.fail(new Error('실행을 중지했습니다.')); }
  destroy() { this.cancel(); }
}
