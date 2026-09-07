import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const problems = JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/problems.json'), 'utf8')) as Array<any>;

async function openProblem(page: Page, id: number) {
  await page.goto(`/problem/${id}`);
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('#run-button')).toBeEnabled();
}
async function code(page: Page, value: string) {
  const editor = page.locator('.monaco-editor').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
}
async function run(page: Page, value: string, input = '') {
  await code(page,value);
  await page.locator('#input-tab').click();
  await page.locator('#stdin').fill(input);
  await page.locator('#run-button').click();
  await expect(page.locator('#stop-button')).toBeHidden();
}

test('Workers SPA, home, editor, Python runtime, and correct submission', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toContainText('Python을 내 것으로');
  await page.screenshot({path:'test-results/home-desktop.png',fullPage:true});
  await page.getByRole('link',{name:'첫 문제 시작하기'}).click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await code(page,'print("Hello")');
  await page.locator('#submit-button').click();
  await expect(page.locator('.submission-banner')).toContainText('정답입니다!');
  await expect(page.locator('#complete-count')).toHaveText('1');
  await page.screenshot({path:'test-results/problem-desktop.png'});
  await page.reload();
  await expect(page.locator('#complete-count')).toHaveText('1');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('print');
  expect(errors).toEqual([]);
});

test('input, multiline input, stdout without newline, float and syntax diagnostics', async ({page}) => {
  await openProblem(page,6025);
  await run(page,'a = int(input())\nb = int(input())\nprint(a + b)\nprint("끝", end="")','12\n30\n');
  await expect(page.locator('.single-result>.output-text')).toHaveText('42\n끝');
  await run(page,'print(float(input()) * 2)','1.25\n');
  await expect(page.locator('.single-result>.output-text')).toHaveText('2.5\n');
  await run(page,'print("a")\nprint("b")\nif True\n    print(1)');
  await expect(page.locator('.python-error')).toContainText('SyntaxError');
  await expect(page.locator('.python-error')).toContainText('3번째 줄');
  await page.locator('.python-error summary').click();
  await expect(page.locator('.python-error .output-text')).toContainText('<user_code>');
  await run(page,'print(input())','');
  await expect(page.locator('.python-error')).toContainText('EOFError');
});

test('wrong answer, hidden tests, attempts and corrected answer', async ({page}) => {
  await openProblem(page,6025);
  await code(page,'print(42)');
  await page.locator('#submit-button').click();
  await expect(page.locator('.submission-banner')).toContainText('오답입니다.');
  await expect(page.locator('.test-result').nth(0)).toHaveClass(/pass/);
  await page.locator('.test-result').nth(2).locator('summary').click();
  await expect(page.locator('.test-result').nth(2)).toContainText('숨겨진 테스트 케이스 3번에서 실패했습니다.');
  await expect(page.locator('.test-result').nth(2)).not.toContainText('-91');
  await expect(page.locator('#complete-count')).toHaveText('0');
  await code(page,'a, b = map(int, input().split())\nprint(a + b)');
  await page.locator('#submit-button').click();
  await expect(page.locator('.submission-banner')).toContainText('정답입니다!');
  await expect(page.locator('#learning-record')).toContainText('제출 2회');
  await expect(page.locator('#complete-count')).toHaveText('1');
});

test('infinite loop times out without blocking UI, and subsequent execution recovers', async ({page}) => {
  await openProblem(page,6001);
  await expect(page.locator('#runtime-state')).toContainText('준비됨');
  await code(page,'while True:\n    pass');
  await page.locator('#run-button').click();
  await page.locator('#theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.locator('#open-list').click();
  await expect(page.locator('.problem-drawer')).toBeVisible();
  await page.getByRole('button',{name:'문제 목록 닫기'}).click();
  await expect(page.locator('.python-error')).toContainText('실행 시간이 초과되었습니다.');
  await expect(page.locator('#run-duration')).toHaveText('3000ms');
  await run(page,'print("recovered")');
  await expect(page.locator('.single-result>.output-text')).toHaveText('recovered\n');
  await page.screenshot({path:'test-results/problem-light.png'});
});

test('cancel, independent globals and builtins, stderr, output limit and escaping', async ({page}) => {
  await openProblem(page,6001);
  await code(page,'while True:\n    pass');
  await page.locator('#run-button').click();
  await page.locator('#stop-button').click();
  await expect(page.locator('#result-panel')).toContainText('실행을 중지했습니다.');
  await run(page,'import builtins\nbuiltins.previous = 9\nx = 42\nprint("one")');
  await run(page,'import builtins\nprint("x" in globals(), hasattr(builtins, "previous"))\nimport sys\nprint("warning", file=sys.stderr)');
  await expect(page.locator('.single-result>.output-text').first()).toHaveText('False False\n');
  await expect(page.locator('.single-result')).toContainText('warning');
  await run(page,'print("a" * 1000001)');
  await expect(page.locator('.python-error')).toContainText('OutputLimitError');
  await run(page,'print("<img src=x onerror=alert(1)>")');
  await expect(page.locator('.single-result img')).toHaveCount(0);
  await expect(page.locator('.single-result>.output-text')).toContainText('<img');
});

test('hint stages, solution warning/modal, import confirmation, recovery and saved draft', async ({page}) => {
  await openProblem(page,6003);
  await code(page,'# 나의 원래 코드\nprint("draft")');
  await page.locator('#hint-button').click();
  await expect(page.locator('#hint-content .hint')).toHaveCount(1);
  await page.locator('#hint-button').click();
  await expect(page.locator('#hint-content .hint')).toHaveCount(2);
  await page.locator('#solution-button').click();
  await expect(page.locator('dialog')).toContainText('학습 효과가 줄어들 수 있습니다.');
  await page.getByRole('button',{name:'계속 풀어보기'}).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.locator('#solution-button').click();
  await page.locator('#confirm-action').click();
  await expect(page.locator('.solution-dialog')).toContainText('핵심 개념');
  await expect(page.locator('.solution-dialog')).toContainText('풀이 과정');
  await page.screenshot({path:'test-results/solution-modal.png'});
  await page.locator('#import-solution').click();
  await expect(page.locator('dialog')).toContainText('현재 작성한 코드가 정답 코드로 바뀝니다.');
  await page.locator('#confirm-action').click();
  await page.locator('#submit-button').click();
  await expect(page.locator('.submission-banner')).toContainText('정답입니다!');
  await page.locator('#restore-code').click();
  await expect(page.locator('.view-lines')).toContainText('draft');
  await page.reload();
  await expect(page.locator('.view-lines')).toContainText('draft');
  await expect(page.locator('#hint-count')).toHaveText('2/2');
  await expect(page.locator('#learning-record')).toContainText('풀이 열람함');
  await page.locator('#reset-code').click();
  await page.locator('#confirm-action').click();
  await expect(page.locator('.view-lines')).not.toContainText('draft');
  await page.locator('#restore-code').click();
  await expect(page.locator('.view-lines')).toContainText('draft');
});

test('search/filter, direct routing, navigation, per-problem drafts, resizing and settings', async ({page}) => {
  await openProblem(page,6098);
  await code(page,'# 마지막 문제의 코드');
  await page.locator('#font-size').selectOption('20');
  await page.locator('#theme').selectOption('light');
  const separator = page.getByRole('separator');
  const box = (await separator.boundingBox())!;
  await page.mouse.move(box.x+3,box.y+30); await page.mouse.down(); await page.mouse.move(750,box.y+30); await page.mouse.up();
  expect(Number(await separator.getAttribute('aria-valuenow'))).toBeGreaterThan(43);
  await page.locator('#open-list').click();
  await page.locator('#problem-search').fill('6025');
  await expect(page.locator('.problem-list-item')).toHaveCount(1);
  await page.locator('.problem-list-item').click();
  await expect(page).toHaveURL(/problem\/6025/);
  await expect(page.locator('.view-lines')).not.toContainText('마지막 문제의 코드');
  await page.goBack();
  await expect(page.locator('.view-lines')).toContainText('마지막 문제의 코드');
  await page.reload();
  await expect(page.locator('#font-size')).toHaveValue('20');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.locator('#open-list').click();
  await page.locator('[data-filter="done"]').click();
  await expect(page.locator('.list-empty')).toBeVisible();
  await page.locator('[data-filter="todo"]').click();
  await expect(page.locator('.problem-list-item')).toHaveCount(98);
  await page.locator('#category-filter').selectOption('리스트');
  await expect(page.locator('.problem-list-item')).toHaveCount(7);
  await page.goto('/problem/9999');
  await expect(page.getByRole('heading',{level:1})).toHaveText('문제를 찾을 수 없습니다.');
});

test('mobile reading/code tabs, touch layout, runtime and solution', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/problem/6012');
  await expect(page.locator('.problem-pane')).toBeVisible();
  await expect(page.locator('.ide-pane')).toBeHidden();
  await page.screenshot({path:'test-results/mobile-problem.png'});
  await page.locator('[data-mobile="code"]').click();
  await expect(page.locator('.ide-pane')).toBeVisible();
  await run(page,'a = int(input())\nb = int(input())\nprint(a)\nprint(b)','7\n-2\n');
  await expect(page.locator('.single-result>.output-text')).toHaveText('7\n-2\n');
  await page.locator('#submit-button').click();
  await expect(page.locator('.submission-banner')).toContainText('정답입니다!');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/mobile-code.png'});
  await page.locator('[data-mobile="problem"]').click();
  await page.locator('#solution-button').click(); await page.locator('#confirm-action').click();
  await expect(page.locator('.solution-dialog')).toBeVisible();
  await page.screenshot({path:'test-results/mobile-solution.png'});
  await page.getByRole('button',{name:'풀이 닫기'}).click();
  await page.goto('/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/mobile-home.png',fullPage:true});
});

test('keyboard run/submit and output whitespace normalization', async ({page}) => {
  await openProblem(page,6001);
  await code(page,'print("Hello   ")');
  await page.locator('.monaco-editor').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('.result-heading')).toContainText('실행을 완료했습니다.');
  await page.keyboard.press('ControlOrMeta+Shift+Enter');
  await expect(page.locator('.submission-banner')).toContainText('정답입니다!');
});

test('every authored solution runs in the real browser Pyodide worker', async ({page}) => {
  test.setTimeout(900000);
  await page.goto('/');
  const report = await page.evaluate(async (items) => {
    const normalize = (value: string) => value.replace(/\r\n?/g,'\n').split('\n').map(line=>line.replace(/[\t ]+$/g,'')).join('\n').replace(/\n+$/,'');
    const failures: string[] = []; let count = 0;
    for (const p of items) {
      for (let i=0; i<p.tests.length; i++) {
        const t = p.tests[i];
        const result = await new Promise<any>((resolve,reject) => {
          const worker = new Worker('/python-worker.js',{type:'module'});
          let timer = setTimeout(()=>{worker.terminate(); reject(new Error(`${p.id} initialization timeout`));},45000);
          worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
          worker.onmessage = ({data}) => {
            if(data.type==='ready') { clearTimeout(timer); timer=setTimeout(()=>{worker.terminate();reject(new Error(`${p.id} run timeout`));},3000); worker.postMessage({type:'run',code:p.solution.code,input:t.input}); }
            if(data.type==='result') { clearTimeout(timer); worker.terminate(); resolve(data.result); }
            if(data.type==='fatal') { clearTimeout(timer); worker.terminate(); reject(new Error(data.message)); }
          };
          worker.postMessage({type:'init'});
        });
        count++;
        if (result.error || normalize(result.stdout)!==normalize(t.output)) failures.push(`${p.id} #${i+1}: ${JSON.stringify(result.error || result.stdout.slice(0,300))}`);
      }
    }
    return {count,failures};
  },problems);
  expect(report.count).toBe(339);
  expect(report.failures).toEqual([]);
});
