# 024 - 영토 전쟁

## 컨셉
헥스 그리드 맵에서 AI 적과 영토를 놓고 겨루는 턴제 전략 게임. 매 턴 자기 영토에서 유닛을 이동시켜 인접 타일을 점령하고, 점령한 타일에서 수입을 얻어 더 강한 유닛을 고용한다. 맵 전체를 점령하거나 적의 본진을 함락시키면 승리. 랜덤 생성 맵으로 매번 다른 전장을 제공한다.

## 게임 규칙
- 헥스 그리드 맵 (10x10 ~ 15x12), 시작 시 랜덤 생성
- 타일 종류: 평원(수입 1), 숲(수입 1, 방어+1), 산(이동 불가), 마을(수입 3), 본진(수입 5)
- 플레이어(파랑)와 AI(빨강) 각각 본진 1개에서 시작
- 매 턴 수입 = 보유 타일의 수입 합계
- 골드로 유닛 고용: 민병(1G, 전투력1), 전사(3G, 전투력3), 기사(6G, 전투력5), 궁수(4G, 전투력3, 원거리)
- 유닛은 자기 영토 내에서만 고용 가능
- 매 턴 각 유닛은 인접 1칸 이동 가능
- 빈 타일/적 약한 타일 이동 시 점령
- 적 유닛이 있는 타일 공격: 전투력 비교, 높은 쪽 승리 (같으면 공격자 불리)
- 숲 타일의 방어 유닛은 전투력 +1 보너스
- 유닛 합류: 같은 타일에 아군 유닛 이동 시 전투력 합산 (최대 8)
- 적 본진 점령 시 승리
- 30턴 내 승부 안 나면 영토 수로 판정

## 조작법
- PC: 마우스로 유닛 클릭→이동할 타일 클릭, 우클릭으로 정보 확인, 스페이스로 턴 종료
- 모바일: 탭으로 유닛 선택→탭으로 이동, 길게 누르기로 정보, 하단 턴 종료 버튼

## UI 구성
```
┌──────────────────────────────────────────┐
│  ⚔️ 영토 전쟁   턴: 8   골드: 12         │
├──────────────────────────────────────────┤
│                                          │
│      ⬡ ⬡ ⬡ ⬡ ⬡ ⬡ ⬡ ⬡                  │
│     ⬡ 🔵⬡ ⬡ ⬡ ⬡ ⬡ ⬡ ⬡                 │
│      ⬡ ⬡ 🌲⬡ ⬡ ⬡ 🔴⬡                   │
│     ⬡ ⬡ ⬡ ⬡ ⛰️⬡ ⬡ ⬡                   │
│      ⬡ ⬡ ⬡ ⬡ ⬡ ⬡ ⬡ ⬡                  │
│     ⬡ ⬡ 🏘️⬡ ⬡ ⬡ ⬡ ⬡                   │
│      ⬡ ⬡ ⬡ ⬡ ⬡ ⬡ ⬡ ⬡                  │
│                                          │
├──────────────────────────────────────────┤
│ 유닛 고용: [민병 1G][전사 3G][궁수 4G]    │
│           [기사 6G]        [턴 종료]      │
├──────────────────────────────────────────┤
│ 선택: 전사 (전투력 3)  영토: 12/80       │
│ 수입: 15G/턴           적 영토: 8/80     │
└──────────────────────────────────────────┘
```

## 비주얼 스타일
- 헥스 타일: 평면 디자인, 타일 종류별 색상
  - 미점령: 밝은 회색 (#d0d0d0)
  - 플레이어 영토: 파란색 계열 (#4a90d9)
  - AI 영토: 빨간색 계열 (#d94a4a)
  - 숲: 진녹색 (#2d6a2d) + 나무 심볼
  - 산: 진회색 (#6a6a6a) + 삼각형
  - 마을: 타일 위에 집 심볼
- 유닛: 타일 중앙에 숫자(전투력) 표시 + 아이콘
- 선택된 타일: 밝은 노란 테두리 + 이동 가능 타일 하이라이트
- 전투 발생 시 타일이 깜빡이는 애니메이션
- 점령 시 색상이 서서히 변하는 트랜지션 (0.3초)
- 턴 전환: "적 턴" 배너가 화면 중앙에 잠깐 표시

## 핵심 시스템

### 헥스 그리드 시스템
```javascript
// 짝수행 오프셋 좌표계 (even-q offset)
// 인접 타일 계산
function getNeighbors(q, r) {
  const isEvenRow = r % 2 === 0;
  const dirs = isEvenRow
    ? [[-1,-1],[0,-1],[1,0],[0,1],[-1,1],[-1,0]]
    : [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,0]];
  return dirs.map(([dq, dr]) => ({ q: q + dq, r: r + dr }))
             .filter(({q, r}) => q >= 0 && r >= 0 && q < width && r < height);
}

// 헥스 → 픽셀 좌표 변환
function hexToPixel(q, r, size) {
  const x = size * (3/2 * q);
  const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
  return { x, y };
}

// 픽셀 → 헥스 좌표 (클릭 감지)
function pixelToHex(px, py, size) {
  const q = (2/3 * px) / size;
  const r = (-1/3 * px + Math.sqrt(3)/3 * py) / size;
  return cubeRound(q, r); // 큐브 좌표 반올림
}
```

### 맵 생성 알고리즘
```
1. 모든 타일을 평원으로 초기화
2. 산 배치: 퍼린 노이즈 또는 랜덤 클러스터로 15-20% (연결 끊김 방지 체크)
3. 숲 배치: 랜덤 20-25%
4. 마을 배치: 랜덤 3-5개, 서로 3타일 이상 떨어지게
5. 본진 배치: 대각선 양 끝, 거리 최대화
6. BFS로 양 본진 사이 경로 존재 확인 (없으면 산 제거 후 재시도)
```

### AI 시스템
```javascript
function aiTurn(gameState) {
  const ai = gameState.players[1]; // AI
  
  // 1. 유닛 고용 (골드 남으면 본진/마을에 고용)
  while (ai.gold >= 3) {
    const spawnTile = findBestSpawn(ai);
    if (!spawnTile) break;
    if (ai.gold >= 6 && Math.random() < 0.3) {
      spawnUnit(spawnTile, 'knight', ai);
    } else {
      spawnUnit(spawnTile, 'warrior', ai);
    }
  }
  
  // 2. 유닛 이동 (그리디 전략)
  for (const unit of ai.units) {
    const targets = getNeighbors(unit.q, unit.r);
    
    // 우선순위: 약한 적 유닛 공격 > 마을 점령 > 적 영토 점령 > 빈 타일 점령
    const scored = targets
      .filter(t => !isOwnTerritory(t, ai) || hasEnemyUnit(t))
      .map(t => ({
        ...t,
        score: evaluateMove(unit, t, gameState)
      }))
      .sort((a, b) => b.score - a.score);
    
    if (scored.length > 0 && scored[0].score > 0) {
      moveUnit(unit, scored[0]);
    }
  }
}

function evaluateMove(unit, target, state) {
  let score = 0;
  const tile = state.map[target.r][target.q];
  
  if (tile.unit && tile.unit.team !== unit.team) {
    // 이길 수 있는 전투만 시도
    const defense = tile.unit.power + (tile.type === 'forest' ? 1 : 0);
    if (unit.power > defense) score += 10 + tile.income;
    else score -= 5;
  } else if (tile.team !== unit.team) {
    score += tile.income * 2; // 마을 우선 점령
  }
  
  // 본진에 가까울수록 높은 점수
  score += (maxDist - distToEnemyBase(target)) * 0.5;
  
  return score;
}
```

### 전투 해결
```
- 공격자 전투력 vs 방어자 전투력 (+ 지형 보너스)
- 승자: 전투력이 높은 쪽 (동점 시 방어자 승)
- 승자의 전투력 = 원래 전투력 - 패자 전투력 (최소 1)
- 패자 유닛 제거
- 공격자 승리 시 해당 타일 점령
```

## 기술 구현
- Canvas 2D로 헥스 맵 렌더링
- 헥스 타일: ctx.beginPath()로 6각형 경로 그리기
- 유닛 아이콘: 텍스트(emoji/문자)를 fillText로 타일 중앙에 표시
- 클릭 감지: pixelToHex 변환으로 클릭한 타일 식별
- 선택 UI: 선택된 유닛의 이동 가능 타일에 반투명 하이라이트
- AI 턴: setTimeout으로 0.5초 간격으로 유닛을 하나씩 이동 (사용자가 볼 수 있게)
- 전투 애니메이션: 타일 깜빡임 + 데미지 숫자 팝업
- 미니맵: 불필요 (전체 맵이 한 화면에 표시)
- 턴 히스토리: 각 턴의 액션을 배열에 저장, 이전 턴 상태 확인 가능
- 반응형: 헥스 크기를 화면 크기에 맞게 자동 조절
- 모바일 최적화: 탭으로 선택/이동, 길게 눌러 정보 표시 (300ms 딜레이)
