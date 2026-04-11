---
name: add-sprites
description: Canvas 2D API로 게임 스프라이트 에셋을 생성하여 적용. 단일 HTML 게임과 systems/ 분리 게임 모두 지원.
disable-model-invocation: true
argument-hint: [game-directory, e.g. games/001-snake]
---

# /add-sprites — 게임 스프라이트 에셋 생성기

대상 게임: `$ARGUMENTS`

## 작업 흐름

### 1단계: 게임 분석
- 대상 게임의 index.html (또는 systems/*.js) 읽기
- 게임 타입 판별: Canvas 기반 vs DOM 기반
- 현재 렌더링 방식 파악 (단색 도형, 이모지, CSS 등)
- 스프라이트가 필요한 게임 요소 목록 작성 (캐릭터, 적, 아이템, 배경, UI 등)

### 2단계: 스프라이트 생성 (Canvas 기반 게임)

**방식:** 오프스크린 Canvas에 그림을 그려 캐싱. 런타임 생성.

게임의 `<script>` 섹션 상단 또는 별도 JS 파일에 `GameSprites` 객체 생성:

```javascript
const GameSprites = (() => {
  const cache = {};
  
  function create(w, h, drawFn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    drawFn(c.getContext('2d'), w, h);
    return c;
  }
  
  function init() {
    // 각 스프라이트를 Canvas 2D API로 정밀하게 그리기
    cache.player = create(32, 32, (ctx, w, h) => {
      // 그라데이션, 그림자, 디테일 선 등을 활용해 퀄리티 높게
    });
    // ... 게임에 필요한 모든 스프라이트
  }
  
  function get(name) { return cache[name] || null; }
  
  return { init, get, cache };
})();
```

### 3단계: 스프라이트 생성 (DOM 기반 게임)

**방식:** CSS 배경이미지로 data URI 주입, 또는 인라인 SVG.

```javascript
const GameSprites = (() => {
  const cache = {};
  
  function createSVG(svg) {
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  
  function init() {
    cache.card = createSVG('<svg>...</svg>');
    // CSS 변수로 주입
    document.documentElement.style.setProperty('--sprite-card', `url("${cache.card}")`);
  }
  
  return { init, get(name) { return cache[name]; } };
})();
```

### 4단계: 기존 렌더링 코드에 통합

**Canvas 게임:**
```javascript
// 기존: ctx.fillStyle = '#f00'; ctx.fillRect(x, y, w, h);
// 변경: 
const sprite = GameSprites.get('player');
if (sprite) ctx.drawImage(sprite, x, y, w, h);
else { ctx.fillStyle = '#f00'; ctx.fillRect(x, y, w, h); } // fallback
```

**DOM 게임:**
```javascript
// 기존: el.textContent = '🃏';
// 변경:
el.style.backgroundImage = `url("${GameSprites.get('card')}")`;
el.textContent = ''; // 이모지 제거
```

## 스프라이트 그리기 규칙

### 퀄리티 기준
- **그라데이션** 활용 (linear/radial) — 단색 fill 금지
- **그림자/하이라이트** — 입체감 표현
- **디테일 선** — 윤곽, 무늬, 텍스처
- **일관된 팔레트** — 게임의 기존 색상 테마 유지
- **크기 최적화** — 실제 렌더링 크기의 2x로 생성 (선명도)

### 스프라이트 크기 가이드
| 요소 | 권장 크기 |
|------|----------|
| 캐릭터/적 | 32x32 ~ 64x64 |
| 타일/블록 | 게임 셀 크기 × 2 |
| 아이템/아이콘 | 16x16 ~ 32x32 |
| 배경 패턴 | 64x64 ~ 128x128 |
| UI 요소 | 용도에 맞게 |

### Canvas 드로잉 팁
```javascript
// 좋은 예: 그라데이션 + 디테일
ctx.save();
const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
grad.addColorStop(0, '#ff6b6b');
grad.addColorStop(1, '#c92a2a');
ctx.fillStyle = grad;
ctx.beginPath();
ctx.arc(cx, cy, r, 0, Math.PI * 2);
ctx.fill();
// 하이라이트
ctx.fillStyle = 'rgba(255,255,255,0.3)';
ctx.beginPath();
ctx.arc(cx - r*0.2, cy - r*0.3, r*0.3, 0, Math.PI * 2);
ctx.fill();
// 윤곽선
ctx.strokeStyle = 'rgba(0,0,0,0.3)';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
ctx.stroke();
ctx.restore();
```

## 단일 HTML 파일 통합 방법

단일 파일 게임 (025 이외)에서는 `<script>` 태그 안에 GameSprites를 포함:

```html
<script>
// ===== SPRITES =====
const GameSprites = (() => { ... })();

// ===== GAME CODE =====
// ... 기존 게임 코드에서 렌더링 부분만 수정
</script>
```

- GameSprites 코드를 기존 게임 스크립트의 **최상단**에 배치
- 게임 init 함수에서 `GameSprites.init()` 호출
- 기존 렌더링 코드를 drawImage로 교체 (fallback 유지)

## systems/ 분리 게임 통합 방법 (025 등)

- `systems/assets.js` 파일로 분리
- `index.html`에 `<script src="systems/assets.js">` 추가 (renderer.js 전에)
- `main.js` init에서 `Assets.init()` 호출

## 체크리스트

적용 완료 후 확인:
- [ ] GameSprites.init()이 게임 시작 시 호출됨
- [ ] 모든 주요 게임 요소에 스프라이트 적용
- [ ] fallback 유지 (스프라이트 없어도 게임 동작)
- [ ] 기존 게임 로직 변경 없음
- [ ] 문법 에러 없음
