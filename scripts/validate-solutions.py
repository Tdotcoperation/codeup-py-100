"""Verify authored solutions against independently written expected outputs."""
import json, pathlib, re, subprocess, sys

root = pathlib.Path(__file__).resolve().parents[1]
problems = json.loads((root / 'src/data/problems.json').read_text())
def normalize(value):
    return '\n'.join(line.rstrip(' \t') for line in value.replace('\r\n','\n').replace('\r','\n').split('\n')).rstrip('\n')

failures = []
count = 0
for problem in problems:
    for index, case in enumerate(problem['tests'], 1):
        count += 1
        try:
            result = subprocess.run([sys.executable, '-I', '-c', problem['solution']['code']], input=case['input'], text=True, capture_output=True, timeout=3)
            equal = result.stdout == case['output'] if problem.get('strictJudge') else normalize(result.stdout) == normalize(case['output'])
            if result.returncode or not equal:
                failures.append(f"{problem['id']} test #{index}: {result.stderr or repr(result.stdout[:300])}; expected {case['output'][:300]!r}")
        except subprocess.TimeoutExpired:
            failures.append(f"{problem['id']} test #{index}: timeout")
if failures:
    print('\n'.join(failures))
    sys.exit(1)
print(f'PASS: {len(problems)} solutions / {count} test cases (Python {sys.version.split()[0]}).')
