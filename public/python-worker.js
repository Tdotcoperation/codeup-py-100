// Every worker serves exactly one execution, then the UI terminates it.
// Runtime files are copied from the pinned npm package at install/build time.
const runtime = '/runtime/pyodide-314.0.6/';
let python;
const send = self.postMessage.bind(self);
const bootstrap = String.raw`
import sys, io, json, traceback

class OutputLimitError(Exception):
    pass

class LimitedOutput(io.StringIO):
    def __init__(self):
        super().__init__()
        self.size = 0
    def write(self, value):
        self.size += len(value)
        if self.size > 1_000_000:
            raise OutputLimitError('출력은 최대 1,000,000자까지 가능합니다.')
        return super().write(value)

def execute_user(code, stdin):
    old_in, old_out, old_err = sys.stdin, sys.stdout, sys.stderr
    out, err = LimitedOutput(), LimitedOutput()
    result = {'stdout': '', 'stderr': ''}
    try:
        sys.stdin, sys.stdout, sys.stderr = io.StringIO(stdin), out, err
        namespace = {'__name__': '__main__', '__file__': '<user_code>'}
        exec(compile(code, '<user_code>', 'exec'), namespace, namespace)
    except BaseException as error:
        if not (isinstance(error, SystemExit) and error.code in (None, 0)):
            frames = traceback.extract_tb(error.__traceback__)
            lines = [frame.lineno for frame in frames if frame.filename == '<user_code>']
            result['error'] = {
                'type': type(error).__name__, 'message': str(error),
                'line': getattr(error, 'lineno', None) or (lines[-1] if lines else None),
                'traceback': ''.join(traceback.format_exception(error))[-20000:]
            }
    finally:
        result['stdout'], result['stderr'] = out.getvalue(), err.getvalue()
        sys.stdin, sys.stdout, sys.stderr = old_in, old_out, old_err
    return json.dumps(result, ensure_ascii=False)
`;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const { loadPyodide } = await import(runtime + 'pyodide.mjs');
      python = await loadPyodide({ indexURL: runtime });
      python.runPython(bootstrap);
      send({ type: 'ready', version: python.runPython('sys.version.split()[0]') });
    } else if (data.type === 'run' && python) {
      const start = performance.now();
      const execute = python.globals.get('execute_user');
      try {
        const result = JSON.parse(execute(data.code, data.input));
        send({ type: 'result', result: { ...result, duration: performance.now() - start } });
      } finally { execute.destroy(); }
    }
  } catch (error) { send({ type: 'fatal', message: String(error) }); }
};
