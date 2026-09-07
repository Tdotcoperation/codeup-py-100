import './style.css';
import rawProblems from './data/problems.json';
import type { Problem, PythonResult, RecordEntry } from './types';
import { readState, writeState } from './storage';
import { isCorrect } from './judge';
import { PythonRunner, type RunnerStatus } from './runner';
import type { CodeEditor } from './editor';

const problems = rawProblems as Problem[];
const state = readState();
const app = document.querySelector<HTMLDivElement>('#app')!;
const overlays = document.querySelector<HTMLDivElement>('#overlays')!;
const categories = [...new Set(problems.map(p => p.category))];
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const iconPaths: Record<string, string> = {
  terminal: '<path d="m5 6 6 6-6 6m9 0h5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  book: '<path d="M12 5v15M3 4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z"/>',
  bulb: '<path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0l-1 2H9z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  external: '<path d="M14 4h6v6m0-6-10 10M10 4H4v16h16v-6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
};
const icon = (name: string, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.code}</svg>`;
const record = (id: number): RecordEntry => state.records[id] ||= {};
const completed = () => problems.filter(p => record(p.id).completed).length;
const percent = () => Math.round(completed() / problems.length * 100);
const currentTheme = () => state.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : state.theme;
const attribution = '<span>문제 구성은 CodeUp Python 기초 100제를 참고하였습니다.<br>원문 문제의 저작권은 각 저작권자 및 <a href="https://codeup.kr/" target="_blank" rel="noopener noreferrer">CodeUp</a>에 있습니다.</span>';
let current: Problem | undefined;
let editor: CodeEditor | undefined;
let routeGeneration = 0;
let executing = false;
let jobGeneration = 0;
let toastTimer: ReturnType<typeof setTimeout>;
let storageWarned = false;
let saveTimer: ReturnType<typeof setTimeout>;
let panelFilter = 'all';
let panelCategory = '';
let restoreFocus: HTMLElement | null = null;

function toast(message: string) {
  const element = document.querySelector<HTMLDivElement>('#toast')!;
  clearTimeout(toastTimer); element.textContent = message; element.classList.add('show');
  toastTimer = setTimeout(() => element.classList.remove('show'), 3300);
}
function save() {
  clearTimeout(saveTimer);
  const ok = writeState(state);
  const label = document.querySelector('#save-state');
  if (label) label.textContent = ok ? '자동 저장됨' : '저장 실패';
  if (!ok && !storageWarned) { storageWarned = true; toast('브라우저 저장 공간에 저장할 수 없습니다. 코드를 복사해 보관해 주세요.'); }
}
function saveCode(code: string) {
  if (!current) return;
  record(current.id).code = code;
  record(current.id).lastEditedAt = new Date().toISOString();
  const label = document.querySelector('#save-state');
  if (label) label.textContent = '저장 중…';
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 250);
}
function setTheme() {
  const value = currentTheme();
  document.documentElement.dataset.theme = value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#11151b' : '#f7f8fa');
  editor?.setTheme(value);
}
setTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'system') setTheme(); });
const runner = new PythonRunner(updateRuntime);
function updateRuntime(status: RunnerStatus) {
  const element = document.querySelector<HTMLElement>('#runtime-state');
  if (!element) return;
  element.dataset.status = status;
  const labels = { idle: 'Python 3 · 실행 시 준비', loading: 'Python 실행 환경 준비 중…', ready: `Python ${runner.version} 준비됨`, running: 'Python 코드 실행 중…', error: '실행 환경 다시 시도' };
  element.innerHTML = `<span class="status-dot"></span>${esc(labels[status])}`;
  element.title = status === 'error' ? '클릭하여 Python 실행 환경을 다시 준비합니다.' : labels[status];
}
async function prepareRuntime() { const generation = routeGeneration; try { await runner.prepare(); } catch (error) { if (generation === routeGeneration && current) toast(String((error as Error).message)); } }

function header(problemView: boolean) {
  return `<header class="topbar">
    <a class="brand" href="/" aria-label="STEP 홈"><span class="brand-mark">${icon('terminal')}</span>STEP<span class="brand-dot">.</span></a>
    <div class="breadcrumb"><span>학습</span>${icon('chevron')}<span>Python 기초 100제</span></div>
    <div class="top-actions"><div class="header-progress"><span><b id="complete-count">${completed()}</b> / ${problems.length}<span class="desktop-text"> 완료</span></span><div class="tiny-progress"><i style="width:${percent()}%"></i></div></div>
    <select id="theme" aria-label="화면 테마"><option value="dark" ${state.theme==='dark'?'selected':''}>다크</option><option value="light" ${state.theme==='light'?'selected':''}>라이트</option><option value="system" ${state.theme==='system'?'selected':''}>시스템</option></select>
    <button class="button quiet" id="open-list">${icon('list')}<span>문제 목록</span></button></div>
  </header>${problemView ? '<div class="mobile-tabs" role="tablist" aria-label="학습 영역"><button role="tab" aria-selected="true" data-mobile="problem">문제 읽기</button><button role="tab" aria-selected="false" data-mobile="code">코드 작성</button></div>' : ''}`;
}
function bindHeader() {
  document.querySelector('#open-list')?.addEventListener('click', () => openList());
  document.querySelector('#theme')?.addEventListener('change', event => { state.theme = (event.target as HTMLSelectElement).value as typeof state.theme; setTheme(); save(); });
}
function updateProgress() {
  const element = document.querySelector('#complete-count'); if (element) element.textContent = String(completed());
  document.querySelectorAll<HTMLElement>('.tiny-progress i').forEach(e => e.style.width = `${percent()}%`);
}
function home() {
  const last = problems.find(p => p.id === state.lastProblem) || problems[0];
  const touched = problems.some(p => record(p.id).code || record(p.id).attempts);
  const attempts = Object.values(state.records).reduce((sum, r) => sum + (r.attempts || 0), 0);
  app.innerHTML = `${header(false)}<main class="home">
    <div class="home-eyebrow"><span class="status-dot"></span>PYTHON LEARNING WORKSPACE</div>
    <section class="hero"><div><h1>한 문제씩,<br>Python을 내 것으로<span>.</span></h1>
      <p class="hero-description">처음 쓰는 한 줄부터 스스로 푸는 알고리즘까지.<br>문제를 읽고, 코드를 실행하며 차근차근 익혀보세요.</p>
      <a class="button primary hero-cta" href="/problem/${last.id}">${touched ? '이어서 학습하기' : '첫 문제 시작하기'}${icon('arrow')}</a>
      <span class="hero-note">설치 없이 브라우저에서 바로 시작합니다.</span></div>
      <div class="hero-editor" aria-label="Python 학습 예시"><div class="file-tab">${icon('code')} first_step.py<span>Python 3</span></div>
      <div class="demo-code"><div><i>1</i><span class="comment"># 작은 시작이 만드는 변화</span></div><div><i>2</i><span>message <b>=</b> <em>"Hello, Python!"</em></span></div><div><i>3</i><span><strong>print</strong>(message)</span></div><div><i>4</i></div><div><i>5</i><span class="comment"># 이제, 직접 실행해 볼 차례예요.</span></div></div>
      <div class="demo-output"><span>${icon('terminal')} 실행 결과</span><code>Hello, Python!</code><small>${icon('check')} 한 줄의 코드로 시작하는 첫 번째 단계</small></div></div>
    </section>
    <section class="study-overview" aria-label="내 학습 현황"><div class="overview-main"><span class="eyebrow">내 학습 현황</span><div class="overview-count"><strong>${completed()}<span> / ${problems.length}</span></strong><span>${percent()}% 완료</span></div><div class="progress-track"><i style="width:${percent()}%"></i></div></div><div><span class="eyebrow">${touched ? '최근 학습' : '시작할 문제'}</span><a class="recent-link" href="/problem/${last.id}"><b>${last.id}</b><span>${esc(last.title)}</span>${icon('arrow')}</a></div><div><span class="eyebrow">차곡차곡 쌓인 시도</span><strong class="attempts-number">${attempts}<small>번</small></strong><span class="muted small">기록은 이 브라우저에 자동 저장됩니다.</span></div></section>
    <section class="curriculum"><div class="section-heading"><div><span class="eyebrow">LEARNING PATH</span><h2>기초부터, 순서대로</h2></div><button class="button quiet" id="all-problems">전체 ${problems.length}문제 보기 ${icon('arrow')}</button></div>
      <div class="course-table"><div class="course-table-head"><span>학습 분류</span><span>진행률</span><span>문제 수</span><span></span></div>${categories.map((category, index) => {
        const group = problems.filter(p => p.category === category), count = group.filter(p => record(p.id).completed).length;
        return `<button class="course-row" data-category="${esc(category)}"><span class="course-name"><i>${String(index + 1).padStart(2,'0')}</i><span>${esc(category)}<small>${group[0].id}부터 · ${group[0].difficulty}</small></span></span><span class="course-progress"><span class="progress-track"><i style="width:${count/group.length*100}%"></i></span><small>${count} / ${group.length}</small></span><span class="course-size">${group.length}문제</span>${icon('chevron')}</button>`;
      }).join('')}</div>
      <p class="course-note">‘Python 기초 100제’는 원본 문제집 이름입니다. 현재 수록된 6001~6098의 총 98문제로 구성했습니다.</p>
    </section><footer class="home-footer"><div class="footer-brand">STEP. <span>매일, 한 걸음 더.</span></div>${attribution}<a href="https://codeup.kr/problemsetsol.php?psid=33" target="_blank" rel="noopener noreferrer">원본 문제집 ${icon('external')}</a></footer>
  </main>`;
  bindHeader();
  document.querySelector('#all-problems')!.addEventListener('click', () => openList());
  document.querySelectorAll<HTMLElement>('[data-category]').forEach(el => el.addEventListener('click', () => openList(el.dataset.category)));
}

function problemMarkup(p: Problem) {
  const r = record(p.id);
  return `${header(true)}<main class="workspace" data-mobile-view="problem" style="--split:${state.split}%">
    <section class="problem-pane" aria-label="문제 설명"><div class="pane-title"><span>${icon('book')} 문제</span><span class="muted">${p.id - 6000}번째 단계</span></div>
    <div class="problem-scroll"><div class="problem-meta"><span class="category-label">${esc(p.category)}</span><span class="difficulty">${p.difficulty}</span><span id="problem-complete">${r.completed ? '<span class="solved-label">✓ 완료</span>' : ''}</span></div>
    <div class="problem-number">PROBLEM ${p.id}</div><h1 class="problem-title">${esc(p.title)}</h1>
    <a class="source-link" href="${p.sourceUrl}" target="_blank" rel="noopener noreferrer">CodeUp 원문 보기 ${icon('external')}</a>
    <section class="statement"><h2>문제</h2><p>${esc(p.description)}</p></section>
    <section class="statement"><h2>입력</h2><p>${esc(p.inputDescription)}</p></section>
    <section class="statement"><h2>출력</h2><p>${esc(p.outputDescription)}</p></section>
    <section class="statement"><h2>입출력 예</h2>${p.examples.map((ex, i) => `<div class="example-pair"><div><div class="example-label">입력 ${i+1}<button class="text-button" data-example="${i}">실행에 사용 ${icon('arrow')}</button></div><pre class="example-code">${ex.input ? esc(ex.input) : '<span class="muted">입력 없음</span>'}</pre></div><div><div class="example-label">출력 ${i+1}</div><pre class="example-code">${esc(ex.output) || '<span class="muted">출력 없음</span>'}</pre></div></div>`).join('')}<p class="example-note">직접 제작한 학습용 예제입니다.</p></section>
    <section id="hint-content" class="hints-section" aria-live="polite">${hintContent(p)}</section>
    <div class="learning-record" id="learning-record">${learningRecord(p)}</div>
    <div class="problem-attribution">${attribution}</div></div>
    <div class="help-actions"><button id="hint-button" class="button">${icon('bulb')} 힌트 <small id="hint-count">${r.hintLevel || 0}/${p.hints.length}</small></button><button id="solution-button" class="button quiet">${icon('book')} 풀이 보기</button></div></section>
    <div class="splitter" role="separator" tabindex="0" aria-label="문제와 코드 영역 너비 조절" aria-orientation="vertical" aria-valuemin="28" aria-valuemax="65" aria-valuenow="${state.split}"><span></span></div>
    <section class="ide-pane" aria-label="Python IDE"><div class="editor-toolbar"><div class="editor-file">${icon('code')} solution.py <span>Python 3</span></div><div class="editor-tools"><label><span class="sr-only">에디터 글자 크기</span><select id="font-size" aria-label="에디터 글자 크기">${[12,13,14,15,16,18,20,22,24].map(n => `<option value="${n}" ${n===state.fontSize?'selected':''}>${n}px</option>`).join('')}</select></label><button class="icon-button" id="copy-code" aria-label="코드 복사" title="코드 복사">${icon('copy')}</button><button class="icon-button" id="restore-code" aria-label="이전 코드 복구" title="이전 코드 복구" ${r.previousCode===undefined?'disabled':''}>${icon('back')}</button><button class="icon-button" id="reset-code" aria-label="코드 초기화" title="코드 초기화">${icon('reset')}</button></div></div>
    <div class="editor-area"><div id="editor"><div class="editor-loading">코드 편집기를 준비하고 있습니다…</div></div><div class="editor-status"><span id="save-state">자동 저장됨</span><span>UTF-8 <b>·</b> 공백 4칸</span></div></div>
    <section class="console" aria-label="실행 콘솔"><div class="console-header" role="tablist" aria-label="실행 콘솔 탭"><button role="tab" aria-selected="true" id="result-tab" aria-controls="result-panel">실행 결과</button><button role="tab" aria-selected="false" id="input-tab" aria-controls="input-panel">직접 입력</button><span id="run-duration"></span></div><div id="result-panel" class="console-body" role="tabpanel" aria-labelledby="result-tab" tabindex="0" aria-live="polite"><div class="console-empty">${icon('terminal')}<strong>코드의 첫 실행을 기다리고 있어요.</strong><p>예제 입력이 준비되어 있습니다.<br>입력을 바꾸려면 ‘직접 입력’을 선택하세요.</p></div></div><div id="input-panel" class="console-body" role="tabpanel" aria-labelledby="input-tab" hidden><label for="stdin">실행할 입력값</label><textarea id="stdin" spellcheck="false" placeholder="input()으로 읽을 값을 입력하세요. 여러 줄도 가능합니다.">${esc(p.examples[0]?.input || '')}</textarea><span class="small muted">입력값은 ‘실행’에 사용됩니다. ‘제출’은 문제의 전체 테스트로 채점합니다.</span></div></section>
    <div class="run-actions"><button id="runtime-state" class="runtime-state" title="Python 실행 환경 준비"><span class="status-dot"></span>Python 실행 환경 준비 중…</button><div class="run-buttons"><button class="button stop-button" id="stop-button" hidden>중지</button><button class="button" id="run-button" disabled>${icon('play')} 실행 <kbd>⌘ ↵</kbd></button><button class="button primary" id="submit-button" disabled>제출 ${icon('arrow')}</button></div></div></section></main>
    <footer class="problem-nav"><a class="nav-back ${p.id===6001?'disabled':''}" href="/problem/${p.id-1}" ${p.id===6001?'aria-disabled="true" tabindex="-1"':''}>${icon('back')} 이전 문제</a><a href="/" class="nav-position">${p.id-6000} <span>/ ${problems.length}</span></a><a class="nav-next ${p.id===6098?'disabled':''}" href="/problem/${p.id+1}" ${p.id===6098?'aria-disabled="true" tabindex="-1"':''}>다음 문제 ${icon('arrow')}</a></footer>`;
}
function learningRecord(p: Problem) {
  const r = record(p.id);
  return `<span>${icon('clock')} 제출 ${r.attempts || 0}회</span><span>${r.viewedSolution ? '풀이 열람함' : '풀이 미열람'}</span>${r.lastSolvedAt ? `<span>최근 정답 ${new Date(r.lastSolvedAt).toLocaleDateString('ko-KR')}</span>` : ''}`;
}
function hintContent(p: Problem) { return p.hints.slice(0, record(p.id).hintLevel || 0).map((hint,index) => `<div class="hint"><span>힌트 ${index+1}</span><p>${esc(hint)}</p></div>`).join(''); }

async function showProblem(p: Problem, generation: number) {
  current = p; state.lastProblem = p.id; save();
  document.title = `${p.id} ${p.title} · STEP`;
  app.innerHTML = problemMarkup(p);
  bindHeader(); bindProblem(p); updateRuntime(runner.status);
  void prepareRuntime();
  try {
    const { createCodeEditor } = await import('./editor');
    if (generation !== routeGeneration) return;
    const element = document.querySelector<HTMLElement>('#editor')!;
    element.innerHTML = '';
    editor = createCodeEditor(element, record(p.id).code ?? p.starterCode, currentTheme(), state.fontSize, saveCode, () => void execute(false), () => void execute(true));
    setBusy(false);
  } catch {
    if (generation !== routeGeneration) return;
    document.querySelector('#editor')!.innerHTML = '<div class="editor-loading">편집기를 불러오지 못했습니다.<button class="button" id="retry-editor">다시 불러오기</button></div>';
    document.querySelector('#retry-editor')?.addEventListener('click', () => location.reload());
  }
}
function bindProblem(p: Problem) {
  document.querySelector('#run-button')!.addEventListener('click', () => void execute(false));
  document.querySelector('#submit-button')!.addEventListener('click', () => void execute(true));
  document.querySelector('#stop-button')!.addEventListener('click', () => {
    jobGeneration++; runner.cancel(); executing = false; setBusy(false);
    showConsole(); document.querySelector('#result-panel')!.innerHTML = '<div class="result-notice">실행을 중지했습니다. 코드를 수정하고 다시 실행할 수 있습니다.</div>';
  });
  document.querySelector('#runtime-state')!.addEventListener('click', () => { if (!executing) void prepareRuntime(); });
  document.querySelector('#result-tab')!.addEventListener('click', () => showConsole());
  document.querySelector('#input-tab')!.addEventListener('click', () => showConsole('input'));
  document.querySelector('#copy-code')!.addEventListener('click', () => void copy(editor?.getValue() ?? record(p.id).code ?? p.starterCode));
  document.querySelector('#font-size')!.addEventListener('change', event => { state.fontSize = Number((event.target as HTMLSelectElement).value); editor?.setFontSize(state.fontSize); save(); });
  document.querySelector('#reset-code')!.addEventListener('click', () => confirmDialog('코드를 초기화할까요?', '현재 코드를 기본 시작 코드로 바꿉니다. 이전 코드 복구 버튼으로 되돌릴 수 있습니다.', '초기화', () => replaceCode(p.starterCode)));
  document.querySelector('#restore-code')!.addEventListener('click', () => {
    if (record(p.id).previousCode !== undefined) { replaceCode(record(p.id).previousCode!); toast('이전 코드를 복구했습니다.'); }
  });
  document.querySelector('#hint-button')!.addEventListener('click', () => {
    const r = record(p.id); r.hintLevel = Math.min(p.hints.length, (r.hintLevel || 0) + 1); save();
    document.querySelector('#hint-content')!.innerHTML = hintContent(p);
    document.querySelector('#hint-count')!.textContent = `${r.hintLevel}/${p.hints.length}`;
    document.querySelector('#hint-content')!.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (r.hintLevel === p.hints.length) toast('모든 힌트를 확인했습니다. 코드로 옮겨보세요.');
  });
  document.querySelector('#solution-button')!.addEventListener('click', () => confirmDialog('한 번 더 생각해 볼까요?', '풀이를 보면 스스로 문제를 해결하는 학습 효과가 줄어들 수 있습니다.', '풀이 보기', () => openSolution(p), '계속 풀어보기'));
  document.querySelectorAll<HTMLElement>('[data-example]').forEach(button => button.addEventListener('click', () => {
    document.querySelector<HTMLTextAreaElement>('#stdin')!.value = p.examples[Number(button.dataset.example)].input;
    switchMobile('code'); showConsole('input'); toast('예제 입력을 준비했습니다. 실행을 눌러보세요.');
  }));
  document.querySelectorAll<HTMLElement>('[data-mobile]').forEach(button => button.addEventListener('click', () => switchMobile(button.dataset.mobile!)));
  const splitter = document.querySelector<HTMLElement>('.splitter')!;
  const setSplit = (value: number) => {
    state.split = Math.max(28, Math.min(65, Math.round(value)));
    document.querySelector<HTMLElement>('.workspace')!.style.setProperty('--split', `${state.split}%`);
    splitter.setAttribute('aria-valuenow', String(state.split));
  };
  splitter.addEventListener('pointerdown', event => {
    splitter.setPointerCapture(event.pointerId); splitter.classList.add('dragging');
    const move = (event: PointerEvent) => setSplit(event.clientX / innerWidth * 100);
    const end = () => { splitter.classList.remove('dragging'); splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', end); splitter.removeEventListener('pointercancel', end); save(); };
    splitter.addEventListener('pointermove', move); splitter.addEventListener('pointerup', end); splitter.addEventListener('pointercancel', end);
  });
  splitter.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSplit(state.split + (event.key === 'ArrowLeft' ? -2 : 2)); save(); } });
}
function switchMobile(view: string) {
  const workspace = document.querySelector<HTMLElement>('.workspace'); if (workspace) workspace.dataset.mobileView = view;
  document.querySelectorAll<HTMLElement>('[data-mobile]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.mobile === view)));
}
function showConsole(tab: 'input' | 'result' = 'result') {
  document.querySelector<HTMLElement>('#input-panel')!.hidden = tab !== 'input';
  document.querySelector<HTMLElement>('#result-panel')!.hidden = tab !== 'result';
  document.querySelector('#input-tab')!.setAttribute('aria-selected', String(tab === 'input'));
  document.querySelector('#result-tab')!.setAttribute('aria-selected', String(tab === 'result'));
}
function setBusy(value: boolean) {
  executing = value;
  for (const id of ['run-button','submit-button']) { const button = document.querySelector<HTMLButtonElement>(`#${id}`); if (button) button.disabled = value || !editor; }
  const stop = document.querySelector<HTMLButtonElement>('#stop-button'); if (stop) stop.hidden = !value;
}
function textOutput(value: string) {
  const clipped = value.slice(0,32000);
  return `<pre class="output-text">${esc(clipped) || '<span class="muted">출력 없음</span>'}</pre>${value.length > 32000 ? '<p class="small muted">화면에는 처음 32,000자만 표시합니다. 채점에는 전체 출력을 사용합니다.</p>' : ''}`;
}
function friendlyError(error: NonNullable<PythonResult['error']>) {
  const messages: Record<string,string> = {
    SyntaxError: '문법 오류가 발생했습니다. 괄호, 따옴표, 콜론을 확인해 보세요.',
    IndentationError: '들여쓰기를 확인해 주세요. 같은 코드 블록은 들여쓰기 깊이가 같아야 합니다.',
    TabError: 'Tab과 공백이 섞였습니다. 들여쓰기를 공백으로 통일해 주세요.',
    NameError: '정의되지 않은 이름을 사용했습니다. 변수명과 따옴표를 확인해 주세요.',
    ValueError: '입력값을 원하는 형태로 변환할 수 없습니다. 입력과 변환 함수를 확인해 주세요.',
    EOFError: '입력이 부족합니다. input() 호출 횟수와 직접 입력한 줄 수를 확인해 주세요.',
    ZeroDivisionError: '0으로 나눌 수 없습니다. 나누는 값을 확인해 주세요.',
    IndexError: '리스트나 문자열의 범위를 벗어났습니다. 인덱스가 0부터 시작하는지 확인해 주세요.',
    TimeoutError: '실행 시간이 초과되었습니다. 반복문의 종료 조건을 확인해 주세요.',
    OutputLimitError: '출력이 너무 많습니다. 반복문과 출력 위치를 확인해 주세요.',
  };
  return `<div class="python-error"><strong>${esc(error.type)}</strong><p>${error.line ? `${error.line}번째 줄에서 ` : ''}${esc(messages[error.type] || error.message)}</p><details><summary>Python 원본 오류 보기</summary>${textOutput(error.traceback)}</details></div>`;
}
async function execute(submit: boolean) {
  if (!current || !editor || executing) return;
  const p = current, code = editor.getValue(), input = document.querySelector<HTMLTextAreaElement>('#stdin')!.value;
  const generation = ++jobGeneration;
  save(); setBusy(true); switchMobile('code'); showConsole();
  const panel = document.querySelector<HTMLElement>('#result-panel')!;
  document.querySelector('#run-duration')!.textContent = '';
  panel.innerHTML = `<div class="run-progress"><span class="spinner"></span>${submit ? '테스트를 준비하고 있습니다…' : 'Python 코드를 실행하고 있습니다…'}</div>`;
  if (submit) { record(p.id).attempts = (record(p.id).attempts || 0) + 1; save(); document.querySelector('#learning-record')!.innerHTML = learningRecord(p); }
  try {
    if (!submit) {
      const result = await runner.run(code, input);
      if (generation !== jobGeneration) return;
      panel.innerHTML = `<div class="single-result"><div class="result-heading ${result.error ? 'fail' : 'neutral'}">${icon(result.error ? 'close' : 'check')} ${result.error ? '실행 중 오류가 발생했습니다.' : '실행을 완료했습니다.'}</div><details class="used-input"><summary>사용한 입력 보기</summary>${textOutput(input)}</details><h3>출력</h3>${textOutput(result.stdout)}${result.stderr ? `<h3>오류 출력 (stderr)</h3>${textOutput(result.stderr)}` : ''}${result.error ? friendlyError(result.error) : ''}</div>`;
      document.querySelector('#run-duration')!.textContent = `${Math.round(result.duration)}ms`;
    } else {
      let passed = 0, duration = 0;
      const cards: string[] = [];
      for (let index=0; index<p.tests.length; index++) {
        if (generation !== jobGeneration) return;
        const test = p.tests[index];
        panel.innerHTML = `<div class="run-progress"><span class="spinner"></span>테스트 ${index+1} / ${p.tests.length} 채점 중…</div>${cards.join('')}`;
        const result = await runner.run(code, test.input);
        if (generation !== jobGeneration) return;
        const correct = !result.error && isCorrect(result.stdout, test.output, p.strictJudge);
        if (correct) passed++;
        duration += result.duration;
        const label = `${test.hidden ? '숨겨진 ' : ''}테스트 #${index+1}`;
        cards.push(`<details class="test-result ${correct?'pass':'fail'}" ${!correct && !test.hidden?'open':''}><summary><span>${icon(correct?'check':'close')}${label}</span><span>${correct?'통과':result.error ? '실행 오류' : '실패'}<small>${Math.round(result.duration)}ms</small></span></summary>${test.hidden ? `<p class="hidden-message">${correct ? '숨겨진 테스트를 통과했습니다.' : `숨겨진 테스트 케이스 ${index+1}번에서 실패했습니다.`} 학습을 위해 입력과 출력은 표시하지 않습니다.${result.error ? ` (${esc(result.error.type)})` : ''}</p>` : `<div class="test-detail"><h3>입력</h3>${textOutput(test.input)}<h3>예상 출력</h3>${textOutput(test.output)}<h3>실제 출력</h3>${textOutput(result.stdout)}${result.stderr ? `<h3>오류 출력 (stderr)</h3>${textOutput(result.stderr)}` : ''}${result.error?friendlyError(result.error):''}</div>`}</details>`);
      }
      const correct = passed === p.tests.length;
      panel.innerHTML = `<div class="submission-banner ${correct?'pass':'fail'}">${icon(correct?'check':'close')}<div><strong>${correct?'정답입니다!':'오답입니다.'}</strong><span>${p.tests.length}개 테스트 중 ${passed}개 통과${correct?' · 잘 해냈어요. 다음 단계로 나아가세요.':' · 실패한 테스트를 확인하고 다시 도전해 보세요.'}</span></div>${correct ? `<a class="button ${p.id<6098?'primary':'quiet'}" href="${p.id<6098?`/problem/${p.id+1}`:'/'}">${p.id<6098?'다음 문제로 이동':'학습 현황 보기'}${icon('arrow')}</a>` : ''}</div>${cards.join('')}`;
      document.querySelector('#run-duration')!.textContent = `총 ${Math.round(duration)}ms`;
      if (correct) {
        record(p.id).completed = true; record(p.id).lastSolvedAt = new Date().toISOString(); save(); updateProgress();
        document.querySelector('#problem-complete')!.innerHTML = '<span class="solved-label">✓ 완료</span>';
        document.querySelector('#learning-record')!.innerHTML = learningRecord(p); celebrate();
      }
    }
  } catch (error) {
    if (generation !== jobGeneration) return;
    panel.innerHTML = `<div class="result-notice fail">${esc((error as Error).message)}<p>실행 버튼을 눌러 다시 시도할 수 있습니다.</p></div>`;
  } finally {
    if (generation === jobGeneration) { setBusy(false); if (runner.status !== 'error') void prepareRuntime(); }
  }
}
function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const container = document.createElement('div'); container.className = 'celebration'; container.setAttribute('aria-hidden','true');
  container.innerHTML = Array.from({length:24},(_,i)=>`<i style="--x:${15+Math.random()*70}%;--delay:${Math.random()*.3}s;--rotation:${Math.random()*360}deg;--color:${['#a4b3ff','#95cfb4','#e4c88f'][i%3]}"></i>`).join('');
  document.body.append(container); setTimeout(() => container.remove(), 2200);
}
async function copy(code: string) {
  try { await navigator.clipboard.writeText(code); toast('코드를 복사했습니다.'); }
  catch { toast('복사 권한을 사용할 수 없습니다. 코드를 선택하여 복사해 주세요.'); }
}
function replaceCode(code: string) {
  if (!current || !editor) return;
  record(current.id).previousCode = editor.getValue();
  editor.setValue(code); save(); document.querySelector<HTMLButtonElement>('#restore-code')!.disabled = false;
}
function openDialog(content: string, className = '') {
  closeDialog();
  restoreFocus = document.activeElement as HTMLElement;
  const dialog = document.createElement('dialog'); dialog.className = className;
  dialog.setAttribute('aria-labelledby','dialog-title'); dialog.innerHTML = content;
  overlays.append(dialog); dialog.showModal();
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect=dialog.getBoundingClientRect(); const e=event as MouseEvent; if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom) closeDialog(); } });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', closeDialog));
  return dialog;
}
function closeDialog() {
  overlays.querySelectorAll('dialog').forEach(dialog => { dialog.close(); dialog.remove(); });
  if (restoreFocus?.isConnected) restoreFocus.focus();
}
function confirmDialog(title: string, description: string, action: string, onConfirm: () => void, cancel = '취소') {
  const dialog = openDialog(`<button class="dialog-close icon-button" data-close aria-label="닫기">${icon('close')}</button><div class="confirm-icon">${icon('bulb')}</div><h2 id="dialog-title">${esc(title)}</h2><p>${esc(description)}</p><div class="dialog-actions"><button class="button" data-close autofocus>${cancel}</button><button class="button primary" id="confirm-action">${action}</button></div>`, 'confirm-dialog');
  dialog.querySelector('#confirm-action')!.addEventListener('click', () => { closeDialog(); onConfirm(); });
}
function openSolution(p: Problem) {
  record(p.id).viewedSolution = true; save();
  document.querySelector('#learning-record')!.innerHTML = learningRecord(p);
  const solution = p.solution;
  const dialog = openDialog(`<div class="solution-header"><span>${icon('book')} 풀이 노트</span><button class="icon-button" data-close aria-label="풀이 닫기">${icon('close')}</button></div><div class="solution-body"><div class="problem-number">PROBLEM ${p.id}</div><h2 id="dialog-title">${esc(p.title)}</h2><section><h3>문제 이해</h3><p>${esc(solution.understanding)}</p></section><section><h3>핵심 개념</h3><p>${esc(solution.concept)}</p></section><section><h3>풀이 과정</h3><ol>${solution.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol></section><section><h3>예제로 따라가기</h3><p>${esc(solution.example)}</p></section><section><h3>정답 코드</h3><pre class="solution-code"><code>${esc(solution.code)}</code></pre><div class="solution-code-actions"><button class="button" id="copy-solution">${icon('copy')} 코드 복사</button><button class="button primary" id="import-solution">IDE에 코드 넣기 ${icon('arrow')}</button></div></section><aside class="solution-caution">${icon('bulb')}<p>${esc(solution.caution)}</p></aside></div>`, 'solution-dialog');
  dialog.querySelector('#copy-solution')!.addEventListener('click', () => void copy(solution.code));
  dialog.querySelector('#import-solution')!.addEventListener('click', () => confirmDialog('IDE에 코드를 넣을까요?', '현재 작성한 코드가 정답 코드로 바뀝니다. 계속하시겠습니까? 이전 코드는 복구 버튼으로 되돌릴 수 있습니다.', '코드 넣기', () => { replaceCode(solution.code); switchMobile('code'); editor?.focus(); toast('정답 코드를 넣었습니다. 이전 코드도 보관했습니다.'); }));
}

function openList(category = '') {
  panelFilter = 'all'; panelCategory = category;
  const dialog = openDialog(`<div class="drawer-header"><div><span class="eyebrow">LEARNING PATH</span><h2 id="dialog-title">Python 기초 100제</h2></div><button class="icon-button" data-close aria-label="문제 목록 닫기">${icon('close')}</button></div><div class="drawer-progress"><span>${completed()} / ${problems.length} 완료</span><b>${percent()}%</b><div class="progress-track"><i style="width:${percent()}%"></i></div></div><div class="drawer-controls"><label class="search-field">${icon('search')}<input type="search" id="problem-search" placeholder="번호 또는 제목 검색" aria-label="문제 번호 또는 제목 검색"></label><div class="list-filters" aria-label="완료 상태 필터">${[['all','전체'],['done','완료'],['todo','미완료']].map(([v,t])=>`<button data-filter="${v}" aria-pressed="${v==='all'}">${t}</button>`).join('')}</div><select id="category-filter" aria-label="학습 분류 필터"><option value="">모든 학습 분류</option>${categories.map(c=>`<option value="${esc(c)}" ${c===category?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div class="drawer-results" id="drawer-results"></div><div class="drawer-footer">코드와 학습 기록은 이 브라우저에 저장됩니다.</div>`, 'problem-drawer');
  const render = () => {
    const query = dialog.querySelector<HTMLInputElement>('#problem-search')!.value.trim().toLocaleLowerCase();
    const filtered = problems.filter(p => (!panelCategory || p.category===panelCategory) && (panelFilter==='all' || (panelFilter==='done' ? record(p.id).completed : !record(p.id).completed)) && `${p.id} ${p.title} ${p.category}`.toLocaleLowerCase().includes(query));
    dialog.querySelector('#drawer-results')!.innerHTML = filtered.length ? categories.map(c => {
      const group = filtered.filter(p=>p.category===c); if(!group.length) return '';
      return `<section class="list-group"><h3>${esc(c)}<span>${group.length}</span></h3>${group.map(p=>`<a class="problem-list-item ${p.id===current?.id?'active':''}" href="/problem/${p.id}" ${p.id===current?.id?'aria-current="page"':''}><span class="list-status ${record(p.id).completed?'done':''}">${record(p.id).completed ? icon('check') : '<i></i>'}</span><span><b>${p.id}</b>${esc(p.title)}</span>${icon('chevron')}</a>`).join('')}</section>`;
    }).join('') : '<div class="list-empty">조건에 맞는 문제가 없습니다.<br><span>검색어나 필터를 바꿔보세요.</span></div>';
  };
  dialog.querySelector('#problem-search')!.addEventListener('input', render);
  dialog.querySelector('#category-filter')!.addEventListener('change', event => { panelCategory = (event.target as HTMLSelectElement).value; render(); });
  dialog.querySelectorAll<HTMLElement>('[data-filter]').forEach(button => button.addEventListener('click', () => { panelFilter = button.dataset.filter!; dialog.querySelectorAll<HTMLElement>('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button))); render(); }));
  render(); dialog.querySelector<HTMLInputElement>('#problem-search')!.focus();
}
function navigate(path: string) {
  if (path !== location.pathname) history.pushState({},'',path);
  void route();
}
async function route() {
  const generation = ++routeGeneration;
  jobGeneration++; save(); runner.cancel(); setBusy(false); closeDialog(); editor?.dispose(); editor = undefined; current = undefined;
  window.scrollTo(0,0);
  if (location.pathname === '/') { document.title='STEP · Python 기초 100제'; home(); return; }
  const match = location.pathname.match(/^\/problem\/(\d+)\/?$/);
  const p = match && problems.find(p=>p.id===Number(match[1]));
  if (p) { await showProblem(p,generation); return; }
  app.innerHTML = `${header(false)}<main class="not-found"><span class="eyebrow">404</span><h1>문제를 찾을 수 없습니다.</h1><p>6001번부터 6098번까지의 문제를 학습할 수 있습니다.</p><a class="button primary" href="/">학습 홈으로 ${icon('arrow')}</a></main>`;
  bindHeader();
}
document.addEventListener('click', event => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="/"]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); if (link.getAttribute('aria-disabled') === 'true') return;
  navigate(link.getAttribute('href')!);
});
window.addEventListener('popstate', () => void route());
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.visibilityState==='hidden') save(); });
document.addEventListener('keydown', event => {
  if (overlays.querySelector('dialog')) return;
  if ((event.ctrlKey || event.metaKey) && event.key==='Enter' && !(event.target as Element).closest('.monaco-editor')) { event.preventDefault(); void execute(event.shiftKey); }
});
void route();
