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

## 코드 컨벤션

- 순수 HTML/CSS/JS, 외부 라이브러리 없음
- 한 파일(index.html)에 모든 코드 포함
- 한국어 UI
- 모바일 터치 + PC 키보드 모두 지원
