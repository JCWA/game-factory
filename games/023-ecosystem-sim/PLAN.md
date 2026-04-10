# 023 - 생태계 시뮬레이터

## 컨셉
풀, 토끼, 여우가 살아가는 생태계를 관찰하고 조절하는 시뮬레이션. 먹이사슬(풀→토끼→여우)에 따라 개체 수가 자연적으로 변동하며, 플레이어가 환경 변수(비, 가뭄, 질병, 사냥꾼)를 조절하여 생태계 균형을 실험한다. Lotka-Volterra 모델을 시각적으로 체험할 수 있다.

## 게임 규칙
- 시뮬레이션은 2D 필드에서 실시간으로 진행된다
- 3종의 생물: 풀(녹색 타일), 토끼(흰색 점), 여우(주황 점)
- 풀: 빈 타일에서 자동 성장, 인접 타일로 확산
- 토끼: 풀을 먹으면 에너지 획득, 에너지가 일정 이상이면 번식, 0이면 사망
- 여우: 토끼를 잡아먹으면 에너지 획득, 번식/사망 규칙 동일
- 플레이어 개입 도구:
  - 비 (풀 성장 속도 2배, 5초간)
  - 가뭄 (풀 성장 멈춤, 5초간)
  - 질병 (선택한 종 30% 사망)
  - 추가 배치 (클릭으로 토끼/여우 직접 배치)
  - 울타리 (특정 영역 차단)
- 실시간 개체 수 그래프가 우측에 표시된다
- 챌린지 모드: "토끼 50마리 유지하기", "여우를 멸종시키지 않고 30일 버티기" 등
- 모든 종이 멸종하면 게임 오버

## 조작법
- PC: 마우스로 도구 선택 후 맵 클릭으로 적용, 키보드 1-5로 도구 선택
- 모바일: 하단 도구 바에서 선택, 맵 탭으로 적용

## UI 구성
```
┌──────────────────────────────────────────────┐
│  🌿 생태계 시뮬레이터     Day: 42  속도: 2x   │
├──────────────────────────┬───────────────────┤
│                          │ 개체 수 그래프      │
│                          │ ┌───────────────┐ │
│                          │ │🌿───          │ │
│   [60x40 필드]            │ │  🐇──         │ │
│   풀/토끼/여우가           │ │    🦊─        │ │
│   돌아다니는 시뮬레이션     │ │               │ │
│                          │ └───────────────┘ │
│                          │ 풀: 342  🟢       │
│                          │ 토끼: 28  ⚪       │
│                          │ 여우: 7   🟠       │
├──────────────────────────┴───────────────────┤
│ 도구: [🌧비][☀가뭄][🦠질병][🐇+토끼][🦊+여우]  │
│       [🧱울타리]  속도: [1x][2x][5x]         │
└──────────────────────────────────────────────┘
```

## 비주얼 스타일
- 필드 배경: 풀이 자란 곳은 녹색 (#4CAF50), 빈 곳은 갈색 (#8D6E63)
- 풀 밀도에 따라 색상 단계: 연녹→진녹 (3단계)
- 토끼: 흰색 원 (4px), 움직일 때 작은 잔상
- 여우: 주황색 원 (6px), 토끼보다 약간 큼
- 비 효과: 파란 선이 위에서 아래로 내리는 CSS 애니메이션
- 가뭄 효과: 필드 전체에 주황색 오버레이
- 개체 수 그래프: 실시간 라인 차트, 풀=녹색, 토끼=흰색, 여우=주황색
- 번식 시 하트 파티클, 사망 시 작은 X 표시 후 사라짐

## 핵심 시스템

### 생물 에이전트 시스템
```javascript
class Creature {
  constructor(type, x, y) {
    this.type = type;        // 'rabbit' | 'fox'
    this.x = x;
    this.y = y;
    this.energy = 50;
    this.age = 0;
    this.maxAge = type === 'rabbit' ? 300 : 500; // 프레임 단위 수명
  }
}

// 토끼 행동
function updateRabbit(rabbit, grid, creatures) {
  rabbit.age++;
  rabbit.energy -= 0.3; // 기본 에너지 소모
  
  // 인접한 여우 감지 → 반대 방향으로 도주
  const nearbyFox = findNearest(creatures.foxes, rabbit, 5);
  if (nearbyFox) {
    moveAway(rabbit, nearbyFox);
  } else {
    // 풀이 있는 방향으로 이동
    const grassDir = findNearestGrass(grid, rabbit);
    if (grassDir) moveToward(rabbit, grassDir);
    else randomMove(rabbit);
  }
  
  // 풀 위에 있으면 먹기
  if (grid[rabbit.gridY][rabbit.gridX] > 0) {
    rabbit.energy += 20;
    grid[rabbit.gridY][rabbit.gridX] = 0;
  }
  
  // 번식 (에너지 80 이상, 근처에 같은 종 있으면)
  if (rabbit.energy > 80) {
    const mate = findNearest(creatures.rabbits, rabbit, 3);
    if (mate && mate.energy > 60) {
      rabbit.energy -= 30;
      mate.energy -= 30;
      return spawnCreature('rabbit', rabbit.x, rabbit.y);
    }
  }
  
  // 사망 조건
  if (rabbit.energy <= 0 || rabbit.age >= rabbit.maxAge) {
    return 'dead';
  }
}
```

### 풀 시뮬레이션
```javascript
// 그리드 기반 셀룰러 오토마타
// 각 셀: 0 (빈 땅), 1 (새싹), 2 (중간), 3 (무성한 풀)

function updateGrass(grid, width, height) {
  const newGrid = grid.map(row => [...row]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] < 3) {
        // 성장 (일정 확률)
        if (Math.random() < growthRate) {
          newGrid[y][x] = Math.min(3, grid[y][x] + 1);
        }
      }
      if (grid[y][x] === 0) {
        // 확산 (인접 풀이 있으면 낮은 확률로 새싹)
        const neighbors = countNeighborGrass(grid, x, y);
        if (neighbors > 0 && Math.random() < neighbors * 0.02) {
          newGrid[y][x] = 1;
        }
      }
    }
  }
  return newGrid;
}
```

### 개체 수 그래프
```
- 최근 200틱의 데이터를 ring buffer에 저장
- Canvas에 라인 차트로 그리기
- 3개의 선: 풀(스케일 /10), 토끼, 여우
- 자동 Y축 스케일링: 최대값 기준
- 10틱마다 데이터 포인트 추가
```

### 환경 이벤트
```javascript
const EVENTS = {
  rain: {
    duration: 300,  // 5초 (60fps)
    effect: () => { growthRate *= 2; },
    cleanup: () => { growthRate /= 2; }
  },
  drought: {
    duration: 300,
    effect: () => { growthRate = 0; },
    cleanup: () => { growthRate = 0.05; }
  },
  disease: {
    apply: (targetType, creatures) => {
      const targets = creatures[targetType];
      const killCount = Math.floor(targets.length * 0.3);
      for (let i = 0; i < killCount; i++) {
        const idx = Math.floor(Math.random() * targets.length);
        targets.splice(idx, 1);
      }
    }
  }
};
```

## 기술 구현
- 필드: Canvas 2D, 셀 크기 10px, 60x40 = 600x400px 기본
- 생물 렌더링: fillRect 또는 arc로 간단한 원/점
- 풀 렌더링: 셀별 fillRect, 밀도에 따른 색상 보간
- 개체 수 그래프: 별도 Canvas, 200포인트 라인 차트
- 시뮬레이션 루프: requestAnimationFrame, 속도 배수에 따라 프레임당 업데이트 횟수 조절
- 최대 개체 수 제한: 토끼 200, 여우 50 (성능 보호)
- 개체가 많아지면 공간 분할(grid-based lookup)로 최적화
- 도구 적용: 클릭한 위치 근처 일정 범위에 효과 적용
- 울타리: 그리드 셀에 wall 플래그 설정, 생물 이동 시 벽 체크
- 반응형: CSS로 캔버스 크기 조절, 모바일에서 그래프를 하단으로 이동
