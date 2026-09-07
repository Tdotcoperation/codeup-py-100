import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCorrect } from '../src/judge';
import { readState, writeState, defaults } from '../src/storage';
import problems from '../src/data/problems.json';

test('judge ignores line ending and trailing whitespace but preserves content', () => {
  assert.ok(isCorrect('A  \r\nB\t\n\n', 'A\nB'));
  assert.ok(isCorrect('Hello', 'Hello\n'));
  assert.ok(!isCorrect('A B', 'A  B'));
  assert.ok(!isCorrect(' A', 'A'));
  assert.ok(!isCorrect('A\n\nB', 'A\nB'));
  assert.ok(!isCorrect('A\n', 'a\n'));
  assert.ok(!isCorrect('A\n', 'A', true));
});
test('curriculum is complete and has original learning material and varied tests', () => {
  assert.deepEqual(problems.map(p => p.id), Array.from({ length: 98 }, (_, i) => 6001 + i));
  for (const p of problems) {
    assert.ok(p.description.length > 10 && p.solution.concept.length > 25);
    assert.ok(p.hints.length >= 2 && p.solution.steps.length >= 3);
    assert.ok(p.sourceUrl === `https://codeup.kr/problem.php?id=${p.id}`);
    assert.ok(p.id <= 6008 ? p.tests.length === 1 : p.tests.length >= 3);
    assert.ok(p.tests.some(t => t.input === p.examples[0].input && t.output === p.examples[0].output));
    assert.ok(p.id <= 6008 || p.tests.some(t => t.hidden));
  }
});
test('storage preserves drafts, recovery versions and study history', () => {
  const state = defaults();
  state.records[6044] = {code: 'print(42)',previousCode:'print(4)',completed:true,hintLevel:2,attempts:7,viewedSolution:true,lastSolvedAt:'2026-09-07T10:00:00.000Z'};
  state.lastProblem = 6044;
  let raw = '';
  assert.ok(writeState(state, {setItem: (_, value) => { raw=value; }}));
  const loaded = readState({getItem: () => raw});
  assert.equal(loaded.lastProblem, 6044);
  assert.equal(loaded.records[6044].code, 'print(42)');
  assert.equal(loaded.records[6044].previousCode, 'print(4)');
  assert.equal(loaded.records[6044].completed, true);
  assert.equal(loaded.records[6044].attempts, 7);
});
test('damaged or denied storage cannot crash startup or pretend a save succeeded', () => {
  assert.deepEqual(readState({getItem:()=>'{'}),defaults());
  assert.deepEqual(readState({getItem:()=>{throw new Error('Denied');}}),defaults());
  assert.equal(writeState(defaults(),{setItem:()=>{throw new Error('Full');}}),false);
  const loaded = readState({getItem:()=>JSON.stringify({version:1,records:{6001:{code:123,completed:'yes',attempts:-7}},fontSize:999,split:-3,lastProblem:7000})});
  assert.equal(loaded.fontSize,24); assert.equal(loaded.split,28);
  assert.equal(loaded.lastProblem,6001); assert.equal(loaded.records[6001].completed,false);
  assert.equal(loaded.records[6001].code,undefined);
});
