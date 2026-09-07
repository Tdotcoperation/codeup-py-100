# STEP · Python 기초 100제

CodeUp의 [Python 기초 100제 문제집](https://codeup.kr/problemsetsol.php?psid=33)을 참고해 만든 브라우저 기반 Python 학습 환경입니다. 문제를 읽으면서 Monaco Editor에 코드를 작성하고, 브라우저 안의 Pyodide Web Worker에서 실행하고, 직접 만든 테스트 케이스로 제출할 수 있습니다.

확인 시점의 CodeUp 문제집에는 6001~6098, 98문제가 수록되어 있습니다. 이 프로젝트는 원문 문제 설명과 제출 코드를 복제해 보관하지 않고, 문제 번호·제목·원문 링크와 직접 작성한 학습용 요약·입출력 형식·예제·힌트·풀이·테스트를 제공합니다.

## 포함된 기능

- 6001~6098 전체 학습 경로와 학습 분류별 목록
- 문제 화면과 Python 3 Monaco Editor의 데스크톱 좌우 분할 레이아웃
- 마우스 드래그 또는 키보드 화살표로 조절하는 분할선
- 모바일 문제 읽기 / 코드 작성 탭
- Python 문법 하이라이팅, 줄 번호, 자동 들여쓰기, 괄호 자동 완성, 글자 크기
- 코드 복사, 초기화, 이전 코드 복구, `Ctrl/Cmd + Enter` 실행, `Ctrl/Cmd + Shift + Enter` 제출
- Pyodide npm 패키지 314.0.6 (Python 3.14.2)을 ES module Web Worker에서 실행
- 실행별 stdout, stderr, 입력, 실행 시간, 원본 Python 오류 표시
- 기본 3초 제한, 출력 1,000,000자 제한, 시간 초과 시 Worker 종료 및 다음 실행용 Worker 재생성
- 문제별 다중 테스트, hidden 테스트, 마지막 줄바꿈·줄 끝 공백을 무시하는 기본 출력 비교
- 단계별 힌트, 풀이 경고 모달, 풀이 과정과 정답 코드, IDE 가져오기 및 이전 코드 복구
- 완료 문제, 작성 코드, 풀이 열람, 힌트 단계, 시도 횟수, 최근 정답 날짜를 `localStorage`에 자동 저장
- 다크 / 라이트 / 시스템 테마, 학습 진행률과 최근 학습 문제
- Cloudflare Workers Static Assets의 SPA fallback

## 기술 구조

```text
브라우저 UI
  ├─ Vite + TypeScript
  ├─ Monaco Editor
  └─ PythonRunner
       └─ python-worker.js (ES module Worker)
            └─ Pyodide
                 └─ 사용자 Python 코드
```

사용자 코드는 화면의 JavaScript와 같은 전역 공간에서 실행되지 않습니다. 실행을 시작하면 Worker에 코드와 stdin을 전달하고, stdout·stderr·오류 정보만 돌려받습니다. 실행이 끝나거나 3초를 넘기면 해당 Worker를 종료합니다. Pyodide 파일은 빌드 시 설치된 `pyodide` npm 패키지에서 `public/runtime/`으로 복사됩니다.

Pyodide의 Web Worker 모듈 방식과 표준 스트림 연결 방식은 [Pyodide 공식 문서](https://pyodide.org/en/stable/usage/webworker.html)와 [표준 스트림 문서](https://pyodide.org/en/stable/usage/streams.html)를 기준으로 구성했습니다.

## 설치 및 개발

필요한 환경은 Node.js 22 이상입니다. 저장소 루트에서 실행합니다.

```bash
npm install
npm run dev
```

개발 서버는 기본적으로 `http://127.0.0.1:5173`에서 열립니다. Python 런타임 파일은 `postinstall` 단계에서 복사되며, 설치 후 누락되었을 때도 `npm run build`가 다시 준비합니다.

## 빌드와 확인

```bash
npm run typecheck
npm test
npm run test:solutions
npm run build
npm run preview
```

`npm test`는 judge·localStorage·문제 데이터 구조 테스트를 실행하고, `npm run test:solutions`는 98개 정답 코드와 339개 독립 테스트 케이스를 로컬 Python으로 확인합니다. `npm run test:e2e`는 Playwright로 Workers 정적 서버를 띄운 뒤 홈, 문제 이동, Monaco 입력, Pyodide 실행, 제출·오답·hidden 테스트, timeout, 오류 출력, 풀이 모달, 저장, 모바일 화면과 전체 학습 데이터를 검증합니다.

처음 Playwright를 사용할 때는 브라우저를 한 번 설치합니다.

```bash
npx playwright install chromium
npm run test:e2e
```

## Cloudflare Workers 배포

`wrangler.jsonc`는 배포 전에 `npm run build`를 자동으로 실행하고, 생성된 `dist/`를 Workers Static Assets로 올립니다. 존재하지 않는 경로는 `index.html`로 보내 SPA 라우팅을 유지하도록 설정되어 있습니다. 따라서 Cloudflare의 배포 명령을 `npx wrangler deploy`로 지정해도 `dist/`가 없는 상태로 배포를 시작하지 않습니다.

```bash
npm install
npm run build
npm run deploy:check
npm run deploy
```

`npm run deploy`를 처음 실행하면 Wrangler가 Cloudflare 로그인 또는 API 인증을 요구할 수 있습니다. CI에서는 Cloudflare API Token과 Account ID를 GitHub Actions secret으로 넣어야 합니다. 이 프로젝트는 비밀값을 저장소에 넣지 않습니다.

Cloudflare 대시보드에서 GitHub 저장소를 연결할 때는 다음을 사용합니다.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Node.js: 22 이상

대시보드가 별도의 Build command를 실행하지 않고 Deploy command만 실행하는 환경에서도 `wrangler.jsonc`의 custom build가 같은 빌드를 한 번 더 보장합니다. 별도 Build command가 제공되는 경우에는 위처럼 `npm run build`를 넣어 빌드 로그를 확인할 수 있습니다.

Cloudflare Static Assets의 SPA fallback은 [공식 문서](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)의 `not_found_handling: "single-page-application"` 설정을 사용합니다.

## GitHub Actions

`.github/workflows/ci.yml`은 push와 pull request마다 타입 검사, 단위 테스트, 전체 정답 코드 검증, production build를 실행합니다. 배포는 별도의 `npm run deploy` 또는 Cloudflare Git integration에서 수행합니다.

## 문제 데이터 수정

문제 데이터는 [src/data/problems.json](src/data/problems.json)에 있습니다.

각 문제는 다음 필드를 가집니다.

```ts
{
  id, title, sourceTitle, category, sourceCategory, sourceUrl,
  difficulty, description, inputDescription, outputDescription,
  examples, tests, hints, starterCode,
  solution: { understanding, concept, steps, example, caution, code }
}
```

테스트의 `hidden: true`는 학습 화면에서 입력과 예상 출력을 가리는 용도입니다. 원문 CodeUp의 비공개 채점 데이터를 사용하지 않으며, 이 저장소의 테스트는 학습용으로 직접 작성한 것입니다. 새로운 문제를 추가할 때는 `src/types.ts`의 구조에 맞춰 작성하고, `tests/core.test.ts`의 전체 문제 연속성 검증과 `scripts/validate-solutions.py`가 통과하는지 확인합니다.

## 출처와 저작권

문제 구성은 CodeUp Python 기초 100제를 참고하였습니다. 원문 문제의 저작권은 각 저작권자 및 CodeUp에 있습니다. 이 사이트는 CodeUp의 공식 서비스가 아니며, 문제 원문 전체·이미지·원문 제출 코드를 저장하지 않습니다. 각 문제의 화면에서 CodeUp 원문 링크를 제공합니다.

## 오류 해결

- `Python 실행 환경 준비 중…`이 오래 지속되면 브라우저 네트워크에서 `/runtime/pyodide-314.0.6/`의 `.mjs`, `.wasm`, `.zip` 파일이 차단되지 않았는지 확인합니다.
- `실행 시간이 초과되었습니다.`는 사용자 코드가 3초 안에 끝나지 않았다는 뜻입니다. 반복문의 종료 조건을 확인하고 실행 버튼을 다시 누릅니다.
- 풀이 코드와 테스트 코드가 달라지면 `npm run test:solutions`가 어떤 문제·테스트에서 실패했는지 출력합니다.
- Cloudflare에서 직접 `/problem/6001`을 열었을 때 404가 보이면 `wrangler.jsonc`의 `assets.not_found_handling`이 SPA로 설정되어 있는지 확인하고 다시 배포합니다.
- 브라우저 저장이 불가능한 시크릿 모드나 저장 공간 부족 상태에서는 코드와 진행률이 유지되지 않을 수 있습니다.
