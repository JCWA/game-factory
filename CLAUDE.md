# Game Factory

미니 웹게임을 자동으로 기획 → 개발 → 테스트 → 릴리즈하는 프로젝트.

## 워크플로우 규칙

1. **현재 태스크가 완료되면 자동으로 다음 태스크를 진행한다.**
2. 모든 태스크가 완료되면 테스트 → 릴리즈 → 다음 게임 기획을 시작한다.
3. 사용자 확인이 필요한 경우에만 멈춘다 (배포 전, 기획 승인 등).

## 게임 개발 사이클

### Phase 1: 기획
- 게임 컨셉, 규칙, 조작법 정의
- UI/UX 레이아웃 설계
- `games/NNN-게임명/PLAN.md` 작성
- 태스크 분해

### Phase 2: 개발
- HTML + CSS + Vanilla JS (의존성 최소화)
- 단일 `index.html`로 완결 (배포 편의)
- 반응형 디자인 (모바일 우선)
- 디자인은 CSS/SVG/Canvas 기반

### Phase 3: 테스트
- 브라우저에서 동작 확인
- 모바일 터치 지원 확인
- 엣지 케이스 처리

### Phase 4: 릴리즈
- `games/NNN-게임명/` 폴더에 최종 파일 정리
- RELEASES.md에 기록
- **index.html(메인 페이지)에 게임 카드 추가**
- backlog.md에서 완료 표시 → 다음 게임 선택

## 프로젝트 구조

```
game-factory/
├── CLAUDE.md          # 이 파일 (워크플로우 규칙)
├── backlog.md         # 게임 아이디어 큐
├── RELEASES.md        # 릴리즈 기록
├── games/
│   └── NNN-게임명/
│       ├── PLAN.md    # 기획서
│       ├── TASKS.md   # 태스크 목록
│       └── index.html # 게임 파일
├── shared/            # 공통 유틸 (필요시)
└── templates/         # 게임 템플릿
```

## 에이전트 파이프라인

### 기본 모드 (단순~중급 게임)
- 에이전트 1개가 PLAN.md 읽고 index.html 전체 구현
- 4개까지 병렬 스폰 가능

### 고급 모드 (복잡한 게임, 025+)
파일을 시스템별로 분리하여 여러 에이전트가 동시 개발:

```
games/NNN-게임명/
├── PLAN.md
├── TASKS.md
├── index.html          ← 조립 에이전트 (HTML + CSS + script 임포트만)
└── systems/
    ├── core.js         ← 에이전트 A (게임 상태/데이터, 글로벌 네임스페이스: Game.*)
    ├── ai.js           ← 에이전트 B (AI 로직, 네임스페이스: AI.*)
    ├── renderer.js     ← 에이전트 C (렌더링/UI, 네임스페이스: Renderer.*)
    └── audio.js        ← 에이전트 D (사운드, 네임스페이스: Audio.*)
```

#### 에이전트 역할
| 역할 | 담당 |
|------|------|
| 기획 에이전트 | PLAN.md 작성 (시스템별 인터페이스 정의 포함) |
| 시스템 에이전트 (병렬) | 각 시스템 JS 파일 구현, TASKS.md 체크 |
| 조립 에이전트 | index.html 작성 (HTML/CSS + script src 임포트) |
| 릴리즈 에이전트 | 인덱스 업데이트 + git push |

#### TASKS.md 프로토콜
- 서브에이전트는 TaskCreate 못 씀 → TASKS.md 파일로 진행 관리
- 각 에이전트가 자기 태스크에 [x] 체크
- 메인 오케스트레이터가 TASKS.md 읽어서 상태 파악

## 코드 컨벤션

- 순수 HTML/CSS/JS, 외부 라이브러리 없음
- 단순 게임: 한 파일(index.html)에 모든 코드 포함
- 고급 게임: systems/*.js 모듈 분리, index.html에서 `<script src="systems/xxx.js">` 로 임포트
- 한국어 UI
- 모바일 터치 + PC 키보드 모두 지원
