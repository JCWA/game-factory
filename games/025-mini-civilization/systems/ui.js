/**
 * 미니 문명 시뮬레이터 — UI System
 * Namespace: window.UI
 *
 * 담당: 입력 처리, 선택 시스템, DOM 패널/모달, 턴 흐름
 * 의존: Game, AI, Renderer, HexMap (외부 네임스페이스)
 */

window.UI = (() => {
  // ─── 내부 상태 ───────────────────────────────────────────
  let _canvas = null;
  let _drag = { active: false, startX: 0, startY: 0, moved: false };
  let _pinch = { active: false, startDist: 0, startZoom: 1 };
  let _lastTap = 0;
  let _moveRangeTiles = [];     // [{col,row}, ...]
  let _activeModal = null;       // 현재 열린 모달 ID
  let _notificationTimer = null;
  let _isAIProcessing = false;

  // ─── 기술 트리 정의 (UI 표시용) ──────────────────────────
  const TECH_TREE = {
    ancient: [
      { id: 'agriculture', name: '농업', cost: 20, prereqs: [], row: 0, col: 0 },
      { id: 'irrigation', name: '관개', cost: 35, prereqs: ['agriculture'], row: 0, col: 1 },
      { id: 'animalHusbandry', name: '축산', cost: 50, prereqs: ['irrigation'], row: 0, col: 2 },
      { id: 'mining', name: '채광', cost: 20, prereqs: [], row: 1, col: 0 },
      { id: 'smelting', name: '제련', cost: 35, prereqs: ['mining'], row: 1, col: 1 },
      { id: 'blacksmithing', name: '대장장이', cost: 50, prereqs: ['smelting'], row: 1, col: 2 },
      { id: 'combat', name: '전투술', cost: 20, prereqs: [], row: 2, col: 0 },
      { id: 'archery', name: '궁술', cost: 35, prereqs: ['combat'], row: 2, col: 1 },
      { id: 'strategy', name: '전략', cost: 50, prereqs: ['archery'], row: 2, col: 2 },
    ],
    medieval: [
      { id: 'chivalry', name: '기사도', cost: 80, prereqs: [], row: 0, col: 0 },
      { id: 'gunpowder', name: '화약', cost: 120, prereqs: ['chivalry'], row: 0, col: 1 },
      { id: 'navigation', name: '항해술', cost: 80, prereqs: [], row: 1, col: 0 },
      { id: 'exploration', name: '탐험', cost: 120, prereqs: ['navigation'], row: 1, col: 1 },
      { id: 'architecture', name: '건축학', cost: 80, prereqs: [], row: 2, col: 0 },
      { id: 'cityPlanning', name: '도시계획', cost: 120, prereqs: ['architecture'], row: 2, col: 1 },
    ],
    modern: [
      { id: 'industrialRevolution', name: '산업혁명', cost: 200, prereqs: [], row: 0, col: 0 },
      { id: 'railroad', name: '철도', cost: 300, prereqs: ['industrialRevolution'], row: 0, col: 1 },
      { id: 'democracy', name: '민주주의', cost: 200, prereqs: [], row: 1, col: 0 },
      { id: 'freeTrade', name: '자유무역', cost: 300, prereqs: ['democracy'], row: 1, col: 1 },
    ],
  };

  // 건물 정의 (UI 표시용)
  const BUILDINGS = {
    granary:   { name: '곡물창고', cost: 30, desc: '식량 +3/턴' },
    workshop:  { name: '작업장',   cost: 40, desc: '생산력 +3/턴' },
    market:    { name: '시장',     cost: 50, desc: '금 +4/턴' },
    barracks:  { name: '병영',     cost: 40, desc: '군사유닛 생산속도 +50%' },
    walls:     { name: '성벽',     cost: 60, desc: '방어력 +5, 체력 +50' },
    library:   { name: '도서관',   cost: 50, desc: '연구력 +3/턴' },
    temple:    { name: '신전',     cost: 60, desc: '행복도 +2' },
    palace:    { name: '궁전',     cost: 80, desc: '모든 자원 +1/턴 (수도만)' },
  };

  // 유닛 정의 (UI 표시용)
  const UNITS = {
    settler:   { name: '개척자', icon: '🏠', cost: 40, tech: null },
    warrior:   { name: '전사',   icon: '⚔',  cost: 20, tech: null },
    archer:    { name: '궁수',   icon: '🏹', cost: 30, tech: 'archery' },
    knight:    { name: '기사',   icon: '🐎', cost: 50, tech: 'chivalry' },
    siege:     { name: '공성추', icon: '💣', cost: 60, tech: 'gunpowder' },
    musketeer: { name: '머스킷병', icon: '🔫', cost: 70, tech: 'industrialRevolution' },
  };

  const DIPLOMACY_STATUS_LABEL = {
    neutral: '중립',
    friendly: '우호',
    allied: '동맹',
    hostile: '적대',
    war: '전쟁',
  };

  // ─── CSS 주입 ───────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'ui-styles';
    style.textContent = `
      /* ── 글로벌 ────────────────────── */
      :root {
        --bg: #1a1a2e;
        --panel: #16213e;
        --panel-light: #1f2b47;
        --text: #e8e8e8;
        --text-dim: #8899aa;
        --accent: #f0a500;
        --player: #4361ee;
        --ai1: #e63946;
        --ai2: #2a9d8f;
        --danger: #e63946;
        --success: #2a9d8f;
      }
      #game-ui-root * { box-sizing: border-box; margin: 0; padding: 0; }
      #game-ui-root {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        color: var(--text);
        position: absolute; inset: 0;
        pointer-events: none;
        z-index: 10;
        overflow: hidden;
      }
      #game-ui-root > * { pointer-events: auto; }

      /* ── HUD 상단 바 ──────────────── */
      #hud-bar {
        position: absolute; top: 0; left: 0; right: 0;
        height: 40px;
        background: var(--panel);
        border-bottom: 2px solid var(--accent);
        display: flex; align-items: center;
        padding: 0 12px; gap: 16px;
        font-size: 13px;
        z-index: 20;
      }
      #hud-bar .hud-logo {
        font-weight: 700; color: var(--accent); font-size: 15px;
        white-space: nowrap;
      }
      #hud-bar .hud-item { white-space: nowrap; }
      #hud-bar .hud-item span { color: var(--accent); font-weight: 600; }
      #hud-bar .hud-spacer { flex: 1; }
      #hud-bar .hud-research-bar {
        width: 120px; height: 10px;
        background: #0d1b2a; border-radius: 5px;
        overflow: hidden; display: inline-block;
        vertical-align: middle; margin-left: 4px;
      }
      #hud-bar .hud-research-fill {
        height: 100%; background: var(--accent);
        border-radius: 5px; transition: width 0.3s;
      }

      /* ── 하단 액션 바 ─────────────── */
      #action-bar {
        position: absolute; bottom: 0; left: 0; right: 0;
        height: 44px;
        background: var(--panel);
        border-top: 2px solid var(--accent);
        display: flex; align-items: center;
        justify-content: center;
        gap: 8px; padding: 0 8px;
        z-index: 20;
      }
      .ui-btn {
        background: var(--panel-light);
        color: var(--text);
        border: 1px solid #2a3a5e;
        border-radius: 6px;
        padding: 6px 14px;
        cursor: pointer;
        font-size: 13px;
        font-family: inherit;
        transition: background 0.15s, border-color 0.15s;
        white-space: nowrap;
      }
      .ui-btn:hover { background: #2a3a5e; border-color: var(--accent); }
      .ui-btn:active { background: var(--accent); color: #000; }
      .ui-btn-primary {
        background: var(--accent); color: #000; font-weight: 600;
        border-color: var(--accent);
      }
      .ui-btn-primary:hover { background: #d4900a; }
      .ui-btn-danger { border-color: var(--danger); color: var(--danger); }
      .ui-btn-danger:hover { background: var(--danger); color: #fff; }
      .ui-btn:disabled { opacity: 0.4; cursor: default; pointer-events: none; }

      /* ── 유닛 패널 (하단) ──────────── */
      #unit-panel {
        position: absolute; bottom: 48px; left: 8px;
        width: 320px; max-width: calc(100% - 16px);
        background: var(--panel);
        border: 1px solid #2a3a5e;
        border-radius: 8px;
        padding: 10px 14px;
        display: none;
        z-index: 15;
      }
      #unit-panel.visible { display: block; }
      #unit-panel .unit-header {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 6px;
      }
      #unit-panel .unit-icon { font-size: 22px; }
      #unit-panel .unit-name { font-weight: 700; font-size: 15px; }
      #unit-panel .unit-stats {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 2px 12px; font-size: 12px; color: var(--text-dim);
        margin-bottom: 8px;
      }
      #unit-panel .unit-stats span { color: var(--text); }
      #unit-panel .hp-bar {
        width: 100%; height: 6px; background: #0d1b2a;
        border-radius: 3px; margin-bottom: 8px; overflow: hidden;
      }
      #unit-panel .hp-fill {
        height: 100%; border-radius: 3px; transition: width 0.3s;
      }
      #unit-panel .unit-actions { display: flex; gap: 6px; flex-wrap: wrap; }

      /* ── 모달 기본 ─────────────────── */
      .ui-modal-overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.65);
        display: flex; align-items: center; justify-content: center;
        z-index: 100;
        animation: fadeIn 0.15s;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .ui-modal {
        background: var(--panel);
        border: 2px solid var(--accent);
        border-radius: 12px;
        padding: 20px 24px;
        max-width: 560px; width: calc(100% - 32px);
        max-height: calc(100% - 60px);
        overflow-y: auto;
        animation: slideUp 0.2s;
      }
      @keyframes slideUp { from { transform: translateY(30px); opacity:0; } to { transform: translateY(0); opacity:1; } }
      .ui-modal h2 {
        color: var(--accent); font-size: 18px; margin-bottom: 14px;
        border-bottom: 1px solid #2a3a5e; padding-bottom: 8px;
      }
      .ui-modal h3 { color: var(--accent); font-size: 14px; margin: 10px 0 6px; }
      .modal-close-row { text-align: center; margin-top: 14px; }

      /* ── 도시 모달 ──────────────────── */
      .city-stats-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px;
        font-size: 13px; margin-bottom: 10px;
      }
      .city-stats-grid span { color: var(--accent); font-weight: 600; }
      .city-buildings { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
      .city-buildings .tag {
        background: #0d1b2a; padding: 3px 8px; border-radius: 4px; font-size: 12px;
      }
      .city-production {
        background: #0d1b2a; border-radius: 6px; padding: 8px 10px;
        margin-bottom: 10px; font-size: 13px;
      }
      .city-production .prod-bar {
        width: 100%; height: 8px; background: #16213e;
        border-radius: 4px; margin-top: 4px; overflow: hidden;
      }
      .city-production .prod-fill {
        height: 100%; background: var(--accent); border-radius: 4px;
        transition: width 0.3s;
      }
      .buildable-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
      }
      .buildable-item {
        background: #0d1b2a; border: 1px solid #2a3a5e;
        border-radius: 6px; padding: 6px 8px; cursor: pointer;
        font-size: 12px; transition: border-color 0.15s;
      }
      .buildable-item:hover { border-color: var(--accent); }
      .buildable-item .bi-name { font-weight: 600; }
      .buildable-item .bi-cost { color: var(--text-dim); }

      /* ── 기술 트리 모달 ─────────────── */
      .tech-era { margin-bottom: 14px; }
      .tech-era-label {
        font-size: 12px; color: var(--text-dim); text-transform: uppercase;
        letter-spacing: 1px; margin-bottom: 6px;
      }
      .tech-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }
      .tech-node {
        background: #0d1b2a; border: 2px solid #2a3a5e;
        border-radius: 6px; padding: 6px 8px; text-align: center;
        font-size: 12px; cursor: pointer; transition: all 0.15s;
        position: relative;
      }
      .tech-node.researched { border-color: var(--success); background: #1a3a30; }
      .tech-node.current { border-color: var(--accent); background: #2a2a10; }
      .tech-node.available { border-color: #4a5a7e; }
      .tech-node.locked { opacity: 0.4; cursor: default; }
      .tech-node:not(.locked):hover { border-color: var(--accent); }
      .tech-node .tn-name { font-weight: 600; }
      .tech-node .tn-cost { color: var(--text-dim); font-size: 11px; }
      .tech-current-info {
        background: #0d1b2a; border-radius: 6px; padding: 10px;
        margin-top: 8px; font-size: 13px;
      }

      /* ── 외교 모달 ──────────────────── */
      .diplo-civ {
        background: #0d1b2a; border-radius: 8px; padding: 10px 12px;
        margin-bottom: 10px;
      }
      .diplo-header {
        display: flex; align-items: center; gap: 10px; margin-bottom: 6px;
      }
      .diplo-color {
        width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
      }
      .diplo-name { font-weight: 700; font-size: 14px; }
      .diplo-status { font-size: 12px; padding: 2px 8px; border-radius: 10px; }
      .diplo-status.neutral { background: #3a3a5e; }
      .diplo-status.friendly { background: #2a5a3e; }
      .diplo-status.allied { background: #1a6a4e; }
      .diplo-status.hostile { background: #5a2a2a; }
      .diplo-status.war { background: var(--danger); }
      .diplo-favor { font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
      .diplo-actions { display: flex; gap: 6px; flex-wrap: wrap; }

      /* ── 메인 메뉴 ──────────────────── */
      .main-menu-overlay {
        position: absolute; inset: 0;
        background: var(--bg);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        z-index: 200;
      }
      .main-menu-title {
        font-size: 32px; font-weight: 800; color: var(--accent);
        margin-bottom: 8px;
      }
      .main-menu-sub { color: var(--text-dim); margin-bottom: 32px; font-size: 14px; }
      .main-menu-btns { display: flex; flex-direction: column; gap: 10px; width: 220px; }
      .main-menu-btns .ui-btn { text-align: center; padding: 12px; font-size: 15px; }

      /* ── 게임 오버 ──────────────────── */
      .gameover-result { font-size: 28px; font-weight: 800; margin-bottom: 10px; }
      .gameover-result.victory { color: var(--accent); }
      .gameover-result.defeat { color: var(--danger); }
      .gameover-condition { color: var(--text-dim); margin-bottom: 16px; }
      .gameover-score { font-size: 16px; margin-bottom: 16px; }

      /* ── 알림 ────────────────────────── */
      #notification-container {
        position: fixed; top: 50px; left: 50%; transform: translateX(-50%);
        z-index: 150; pointer-events: none;
        display: flex; flex-direction: column; gap: 6px; align-items: center;
      }
      .notification {
        background: var(--panel);
        border: 1px solid var(--accent);
        border-radius: 8px;
        padding: 8px 18px;
        font-size: 13px; font-weight: 600;
        color: var(--accent);
        animation: notifIn 0.3s, notifOut 0.5s 2.5s forwards;
        pointer-events: none;
        white-space: nowrap;
      }
      @keyframes notifIn { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
      @keyframes notifOut { from { opacity:1; } to { opacity:0; transform:translateY(-10px); } }

      /* ── 이동 범위 하이라이트 마커 ──── */
      .move-range-overlay {
        position: absolute; inset: 0;
        pointer-events: none; z-index: 5;
      }

      /* ── 반응형 ─────────────────────── */
      @media (max-width: 600px) {
        #hud-bar { font-size: 11px; padding: 0 6px; gap: 8px; height: 36px; }
        #action-bar { height: 40px; gap: 4px; }
        .ui-btn { padding: 5px 8px; font-size: 12px; }
        #unit-panel { width: calc(100% - 16px); bottom: 44px; }
        .ui-modal { padding: 14px 16px; }
        .tech-grid { grid-template-columns: repeat(2, 1fr); }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── DOM 구조 생성 ──────────────────────────────────────
  function _createDOMStructure() {
    // index.html already has game-container with its own DOM structure.
    // We need to create ONLY the missing elements that ui.js relies on,
    // and wire up the existing index.html buttons to ui.js handlers.
    const hasGameContainer = !!document.getElementById('game-container');

    if (hasGameContainer) {
      // === Bridge mode: create missing elements needed by ui.js ===

      // 1) unit-panel (for showUnitPanel)
      if (!document.getElementById('unit-panel')) {
        const unitPanel = document.createElement('div');
        unitPanel.id = 'unit-panel';
        unitPanel.innerHTML = `
          <div class="unit-header">
            <div class="unit-icon" id="up-icon"></div>
            <div class="unit-name" id="up-name"></div>
          </div>
          <div class="hp-bar"><div class="hp-fill" id="up-hp-fill"></div></div>
          <div class="unit-stats" id="up-stats"></div>
          <div class="unit-actions" id="up-actions"></div>
        `;
        const canvasArea = document.getElementById('canvas-area');
        if (canvasArea) {
          canvasArea.appendChild(unitPanel);
        } else {
          document.body.appendChild(unitPanel);
        }
      }

      // 2) modal-container (for _renderModal)
      if (!document.getElementById('modal-container')) {
        const mc = document.createElement('div');
        mc.id = 'modal-container';
        document.body.appendChild(mc);
      }

      // 3) notification-container (for showNotification)
      if (!document.getElementById('notification-container')) {
        const nc = document.createElement('div');
        nc.id = 'notification-container';
        document.body.appendChild(nc);
      }

      // 4) Wire up existing index.html toolbar buttons
      const endTurnBtn = document.getElementById('btn-end-turn');
      if (endTurnBtn) endTurnBtn.addEventListener('click', () => UI.endTurn());

      const techBtn = document.getElementById('btn-tech-tree');
      if (techBtn) techBtn.addEventListener('click', () => UI.showTechTree());

      const diploBtn = document.getElementById('btn-diplomacy');
      if (diploBtn) diploBtn.addEventListener('click', () => UI.showDiplomacy());

      const saveBtn = document.getElementById('btn-save');
      if (saveBtn) saveBtn.addEventListener('click', () => {
        if (typeof Main !== 'undefined' && typeof Main.saveGame === 'function') {
          Main.saveGame();
        } else {
          UI.showNotification('저장 기능을 사용할 수 없습니다');
        }
      });

      const menuBtn = document.getElementById('btn-menu');
      if (menuBtn) menuBtn.addEventListener('click', () => UI.showMainMenu());

      // 5) Wire up city manage button
      const manageCityBtn = document.getElementById('btn-manage-city');
      if (manageCityBtn) {
        manageCityBtn.addEventListener('click', () => {
          if (UI.selectedCity) UI.showCityPanel(UI.selectedCity);
        });
      }

      return;
    }

    // === Standalone mode: create full UI from scratch ===
    if (document.getElementById('game-ui-root')) return;

    const root = document.createElement('div');
    root.id = 'game-ui-root';
    root.innerHTML = `
      <!-- HUD 상단 바 -->
      <div id="hud-bar">
        <div class="hud-logo">⚔ 미니 문명</div>
        <div class="hud-item">턴: <span id="hud-turn">1/100</span></div>
        <div class="hud-item">금: <span id="hud-gold">50</span></div>
        <div class="hud-item">
          연구: <span id="hud-research-name">없음</span>
          <div class="hud-research-bar"><div class="hud-research-fill" id="hud-research-fill" style="width:0%"></div></div>
        </div>
        <div class="hud-spacer"></div>
        <div class="hud-item" id="hud-happiness"></div>
      </div>

      <!-- 유닛 정보 패널 -->
      <div id="unit-panel">
        <div class="unit-header">
          <div class="unit-icon" id="up-icon"></div>
          <div class="unit-name" id="up-name"></div>
        </div>
        <div class="hp-bar"><div class="hp-fill" id="up-hp-fill"></div></div>
        <div class="unit-stats" id="up-stats"></div>
        <div class="unit-actions" id="up-actions"></div>
      </div>

      <!-- 하단 액션 바 -->
      <div id="action-bar">
        <button class="ui-btn ui-btn-primary" id="btn-end-turn">턴 종료 (Enter)</button>
        <button class="ui-btn" id="btn-tech">기술트리 (T)</button>
        <button class="ui-btn" id="btn-diplo">외교 (D)</button>
        <button class="ui-btn" id="btn-menu">메뉴</button>
      </div>

      <!-- 알림 컨테이너 -->
      <div id="notification-container"></div>

      <!-- 모달 컨테이너 -->
      <div id="modal-container"></div>
    `;
    document.body.appendChild(root);

    // 버튼 이벤트
    document.getElementById('btn-end-turn').addEventListener('click', () => UI.endTurn());
    document.getElementById('btn-tech').addEventListener('click', () => UI.showTechTree());
    document.getElementById('btn-diplo').addEventListener('click', () => UI.showDiplomacy());
    document.getElementById('btn-menu').addEventListener('click', () => UI.showMainMenu());
  }

  // ─── 유틸 ──────────────────────────────────────────────
  function _getPlayerCiv() {
    if (!Game || !Game.state) return null;
    return Game.state.civilizations.find(c => !c.isAI) || Game.state.civilizations[0];
  }

  function _getCivColor(civId) {
    const colors = ['var(--player)', 'var(--ai1)', 'var(--ai2)'];
    return colors[civId] || colors[0];
  }

  function _getCivColorHex(civId) {
    const colors = ['#4361ee', '#e63946', '#2a9d8f'];
    return colors[civId] || colors[0];
  }

  function _hpColor(ratio) {
    if (ratio > 0.6) return 'var(--success)';
    if (ratio > 0.3) return 'var(--accent)';
    return 'var(--danger)';
  }

  function _el(id) { return document.getElementById(id); }

  function _clearModal() {
    const mc = _el('modal-container');
    if (mc) mc.innerHTML = '';
    _activeModal = null;
  }

  function _renderModal(id, html) {
    _clearModal();
    _activeModal = id;
    const mc = _el('modal-container');
    if (!mc) { console.error('[UI] modal-container not found'); return; }
    mc.innerHTML = `
      <div class="ui-modal-overlay" id="modal-overlay-${id}">
        <div class="ui-modal" id="modal-${id}">
          ${html}
        </div>
      </div>
    `;
    // 배경 클릭으로 닫기
    const overlay = _el(`modal-overlay-${id}`);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) UI.closeModal();
    });
  }

  // ─── 공개 API ──────────────────────────────────────────

  const UI = {
    selectedUnit: null,
    selectedCity: null,

    // ─────────────────────────────────────────────────────
    // 초기화
    // ─────────────────────────────────────────────────────
    init(canvas) {
      _injectStyles();
      _createDOMStructure();
      if (canvas) {
        UI.initInput(canvas);
      }
    },

    // ─────────────────────────────────────────────────────
    // INPUT HANDLING
    // ─────────────────────────────────────────────────────
    initInput(canvas) {
      _canvas = canvas;

      // 뷰포트 좌표 → 캔버스 내부 좌표 변환 (devicePixelRatio 보정 포함)
      function _canvasCoords(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return {
          x: (clientX - rect.left) * dpr,
          y: (clientY - rect.top) * dpr,
        };
      }

      // ── 마우스 이벤트 ──
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          _drag.active = true;
          _drag.startX = e.clientX;
          _drag.startY = e.clientY;
          _drag.moved = false;
        }
      });

      canvas.addEventListener('mousemove', (e) => {
        if (!_drag.active) return;
        const dx = e.clientX - _drag.startX;
        const dy = e.clientY - _drag.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          _drag.moved = true;
          if (typeof Renderer !== 'undefined' && Renderer.camera) {
            const dpr = window.devicePixelRatio || 1;
            Renderer.camera.x += dx * dpr;
            Renderer.camera.y += dy * dpr;
            if (typeof Renderer.render === 'function') Renderer.render();
          }
          _drag.startX = e.clientX;
          _drag.startY = e.clientY;
        }
      });

      canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0 && !_drag.moved) {
          // 클릭 — 선택
          const sc = _canvasCoords(e.clientX, e.clientY);
          const world = Renderer.screenToWorld(sc.x, sc.y);
          const hex = HexMap.pixelToHex(world.x, world.y, Renderer.camera.hexSize);
          if (hex) UI.selectTile(hex.col, hex.row);
        }
        _drag.active = false;
      });

      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (UI.selectedUnit && !_isAIProcessing) {
          const sc = _canvasCoords(e.clientX, e.clientY);
          const world = Renderer.screenToWorld(sc.x, sc.y);
          const hex = HexMap.pixelToHex(world.x, world.y, Renderer.camera.hexSize);
          if (hex) UI.commandUnit(UI.selectedUnit, hex.col, hex.row);
        }
      });

      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (typeof Renderer !== 'undefined' && Renderer.camera) {
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          const sc = _canvasCoords(e.clientX, e.clientY);
          Renderer.camera.zoomAt(delta, sc.x, sc.y);
          if (typeof Renderer.render === 'function') Renderer.render();
        }
      }, { passive: false });

      // ── 터치 이벤트 ──
      let _touchStartTime = 0;

      canvas.addEventListener('touchstart', (e) => {
        const touches = e.touches;
        if (touches.length === 1) {
          _drag.active = true;
          _drag.startX = touches[0].clientX;
          _drag.startY = touches[0].clientY;
          _drag.moved = false;
          _touchStartTime = Date.now();
        } else if (touches.length === 2) {
          _drag.active = false;
          const dx = touches[0].clientX - touches[1].clientX;
          const dy = touches[0].clientY - touches[1].clientY;
          _pinch.startDist = Math.sqrt(dx * dx + dy * dy);
          _pinch.startZoom = Renderer.camera ? Renderer.camera.zoom : 1;
          _pinch.active = true;
        }
      }, { passive: false });

      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touches = e.touches;
        if (_pinch.active && touches.length === 2) {
          const dx = touches[0].clientX - touches[1].clientX;
          const dy = touches[0].clientY - touches[1].clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const scale = dist / _pinch.startDist;
          if (typeof Renderer !== 'undefined' && Renderer.camera) {
            Renderer.camera.zoom = Math.max(0.3, Math.min(3, _pinch.startZoom * scale));
            if (typeof Renderer.render === 'function') Renderer.render();
          }
        } else if (_drag.active && touches.length === 1) {
          const dx = touches[0].clientX - _drag.startX;
          const dy = touches[0].clientY - _drag.startY;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
            _drag.moved = true;
            if (typeof Renderer !== 'undefined' && Renderer.camera) {
              const dpr = window.devicePixelRatio || 1;
              Renderer.camera.x += dx * dpr;
              Renderer.camera.y += dy * dpr;
              if (typeof Renderer.render === 'function') Renderer.render();
            }
            _drag.startX = touches[0].clientX;
            _drag.startY = touches[0].clientY;
          }
        }
      }, { passive: false });

      canvas.addEventListener('touchend', (e) => {
        if (_pinch.active) {
          _pinch.active = false;
          return;
        }
        if (!_drag.moved && e.changedTouches.length === 1) {
          const t = e.changedTouches[0];
          const now = Date.now();
          const timeSinceLast = now - _lastTap;

          if (timeSinceLast < 300 && timeSinceLast > 50) {
            // 더블탭 — 이동/공격 명령
            if (UI.selectedUnit && !_isAIProcessing) {
              const sc = _canvasCoords(t.clientX, t.clientY);
              const world = Renderer.screenToWorld(sc.x, sc.y);
              const hex = HexMap.pixelToHex(world.x, world.y, Renderer.camera.hexSize);
              if (hex) UI.commandUnit(UI.selectedUnit, hex.col, hex.row);
            }
          } else {
            // 싱글탭 — 선택
            const sc = _canvasCoords(t.clientX, t.clientY);
            const world = Renderer.screenToWorld(sc.x, sc.y);
            const hex = HexMap.pixelToHex(world.x, world.y, Renderer.camera.hexSize);
            if (hex) UI.selectTile(hex.col, hex.row);
          }
          _lastTap = now;
        }
        _drag.active = false;
      });

      // ── 키보드 ──
      document.addEventListener('keydown', (e) => {
        if (_activeModal) {
          if (e.key === 'Escape') { UI.closeModal(); e.preventDefault(); }
          return;
        }
        if (_isAIProcessing) return;

        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            UI.endTurn();
            break;
          case 'b': case 'B':
            e.preventDefault();
            _buildCity();
            break;
          case 't': case 'T':
            e.preventDefault();
            UI.showTechTree();
            break;
          case 'd': case 'D':
            e.preventDefault();
            UI.showDiplomacy();
            break;
          case 'Escape':
            e.preventDefault();
            _deselect();
            break;
          case '1': case '2': case '3': case '4': case '5': {
            e.preventDefault();
            const idx = parseInt(e.key) - 1;
            const player = _getPlayerCiv();
            if (player && player.units[idx]) {
              UI.selectedCity = null;
              UI.selectedUnit = player.units[idx];
              UI.showUnitPanel(UI.selectedUnit);
              UI.showMoveRange(UI.selectedUnit);
              if (typeof Renderer !== 'undefined' && typeof Renderer.render === 'function') {
                Renderer.render();
              }
            }
            break;
          }
        }
      });
    },

    // ─────────────────────────────────────────────────────
    // SELECTION SYSTEM
    // ─────────────────────────────────────────────────────
    selectTile(col, row) {
      if (_isAIProcessing) return;
      const state = Game.state;
      if (!state) return;

      const player = _getPlayerCiv();
      if (!player) return;

      // 타일 위의 플레이어 유닛 확인
      const unit = player.units.find(u => u.x === col && u.y === row);
      if (unit) {
        UI.selectedCity = null;
        UI.selectedUnit = unit;
        UI.showUnitPanel(unit);
        UI.showMoveRange(unit);
        if (typeof Renderer !== 'undefined') {
          Renderer.selectedHex = { col, row };
          if (typeof Renderer.render === 'function') Renderer.render();
        }
        return;
      }

      // 타일 위의 플레이어 도시 확인
      const city = player.cities.find(c => c.x === col && c.y === row);
      if (city) {
        UI.selectedUnit = null;
        _moveRangeTiles = [];
        UI.selectedCity = city;
        _hideUnitPanel();
        UI.showCityPanel(city);
        if (typeof Renderer !== 'undefined') {
          Renderer.selectedHex = { col, row };
          Renderer.moveRange = [];
          if (typeof Renderer.render === 'function') Renderer.render();
        }
        return;
      }

      // 이동 범위 안의 타일을 클릭한 경우 — 선택된 유닛 이동
      if (UI.selectedUnit) {
        const inRange = _moveRangeTiles.some(t => t.col === col && t.row === row);
        if (inRange) {
          UI.commandUnit(UI.selectedUnit, col, row);
          return;
        }
      }

      // 빈 타일 — 선택 해제
      _deselect();
      if (typeof Renderer !== 'undefined') {
        Renderer.selectedHex = { col, row };
        Renderer.moveRange = [];
        if (typeof Renderer.render === 'function') Renderer.render();
      }
    },

    showMoveRange(unit) {
      if (!unit || unit.movesLeft <= 0) {
        _moveRangeTiles = [];
        if (typeof Renderer !== 'undefined') Renderer.moveRange = [];
        return;
      }

      // BFS로 이동 가능 타일 계산
      const state = Game.state;
      const visited = new Map();
      const queue = [{ col: unit.x, row: unit.y, cost: 0 }];
      visited.set(`${unit.x},${unit.y}`, 0);
      const result = [];

      while (queue.length > 0) {
        const cur = queue.shift();
        const neighbors = typeof HexMap !== 'undefined' && typeof HexMap.getNeighbors === 'function'
          ? HexMap.getNeighbors(cur.col, cur.row)
          : _getHexNeighbors(cur.col, cur.row);

        for (const n of neighbors) {
          if (n.col < 0 || n.row < 0 || n.col >= state.mapWidth || n.row >= state.mapHeight) continue;

          const tileIdx = n.row * state.mapWidth + n.col;
          const tile = state.tiles[tileIdx];
          if (!tile) continue;

          // 물, 경계 이동 불가
          const terrain = tile.terrain;
          if (terrain === 'water') continue;

          const moveCost = _getTerrainMoveCost(terrain);
          const totalCost = cur.cost + moveCost;
          const key = `${n.col},${n.row}`;

          if (totalCost <= unit.movesLeft && (!visited.has(key) || visited.get(key) > totalCost)) {
            // 아군 유닛이 있는 타일에는 이동 불가 (스택 금지)
            const player = _getPlayerCiv();
            const occupiedByAlly = player && player.units.some(u => u !== unit && u.x === n.col && u.y === n.row);
            visited.set(key, totalCost);
            queue.push({ col: n.col, row: n.row, cost: totalCost });
            if (!occupiedByAlly) {
              result.push({ col: n.col, row: n.row });
            }
          }
        }
      }

      _moveRangeTiles = result;
      if (typeof Renderer !== 'undefined') {
        Renderer.moveRange = result;
        if (typeof Renderer.render === 'function') Renderer.render();
      }
    },

    commandUnit(unit, targetCol, targetRow) {
      if (!unit || _isAIProcessing) return;
      const state = Game.state;
      if (!state) return;

      // 적 유닛이 있는 타일 — 공격
      const allEnemyUnits = [];
      state.civilizations.forEach(civ => {
        if (civ.isAI) {
          civ.units.forEach(u => allEnemyUnits.push({ unit: u, civId: civ.id }));
        }
      });
      const enemyUnit = allEnemyUnits.find(e => e.unit.x === targetCol && e.unit.y === targetRow);

      // 적 도시가 있는 타일 — 도시 공격
      const allEnemyCities = [];
      state.civilizations.forEach(civ => {
        if (civ.isAI) {
          civ.cities.forEach(c => allEnemyCities.push({ city: c, civId: civ.id }));
        }
      });
      const enemyCity = allEnemyCities.find(e => e.city.x === targetCol && e.city.y === targetRow);

      if (enemyUnit && typeof Game.combat === 'function') {
        // 인접한 타일인지 확인
        const neighbors = typeof HexMap !== 'undefined' && typeof HexMap.getNeighbors === 'function'
          ? HexMap.getNeighbors(unit.x, unit.y)
          : _getHexNeighbors(unit.x, unit.y);
        const isAdjacent = neighbors.some(n => n.col === targetCol && n.row === targetRow);

        if (isAdjacent) {
          const result = Game.combat(unit, enemyUnit.unit);
          UI.showNotification(`전투! ${result.message || ''}`);
          _afterUnitAction(unit);
        } else {
          // 적에게 접근하기 위해 먼저 이동
          _moveTowards(unit, targetCol, targetRow, () => {
            // 이동 후 인접하면 공격
            const nbrs = typeof HexMap !== 'undefined' && typeof HexMap.getNeighbors === 'function'
              ? HexMap.getNeighbors(unit.x, unit.y)
              : _getHexNeighbors(unit.x, unit.y);
            if (nbrs.some(n => n.col === targetCol && n.row === targetRow) && unit.movesLeft > 0) {
              if (typeof Game.combat === 'function') {
                Game.combat(unit, enemyUnit.unit);
              }
            }
            _afterUnitAction(unit);
          });
        }
        return;
      }

      if (enemyCity && typeof Game.combat === 'function') {
        const neighbors = typeof HexMap !== 'undefined' && typeof HexMap.getNeighbors === 'function'
          ? HexMap.getNeighbors(unit.x, unit.y)
          : _getHexNeighbors(unit.x, unit.y);
        const isAdjacent = neighbors.some(n => n.col === targetCol && n.row === targetRow);

        if (isAdjacent) {
          const result = Game.combat(unit, enemyCity.city);
          UI.showNotification(`도시 공격! ${result.message || ''}`);
          _afterUnitAction(unit);
        } else {
          _moveTowards(unit, targetCol, targetRow, () => {
            _afterUnitAction(unit);
          });
        }
        return;
      }

      // 일반 이동
      if (typeof Game.moveUnit === 'function') {
        const path = typeof HexMap !== 'undefined' && typeof HexMap.findPath === 'function'
          ? HexMap.findPath(unit.x, unit.y, targetCol, targetRow, Game.state.tiles, Game.state.mapWidth, Game.state.mapHeight)
          : null;

        if (path && path.length > 0) {
          _animateMovePath(unit, path, () => {
            _afterUnitAction(unit);
          });
        } else {
          // 직접 이동 시도
          Game.moveUnit(unit, targetCol, targetRow);
          _afterUnitAction(unit);
        }
      }
    },

    // ─────────────────────────────────────────────────────
    // HUD
    // ─────────────────────────────────────────────────────
    updateHUD() {
      const state = Game.state;
      if (!state) return;
      const player = _getPlayerCiv();
      if (!player) return;

      const turnEl = _el('hud-turn');
      const goldEl = _el('hud-gold');
      const resNameEl = _el('hud-research-name') || _el('hud-research');
      const resFillEl = _el('hud-research-fill');
      const happyEl = _el('hud-happiness');

      if (turnEl) turnEl.textContent = `${state.turn}/100`;
      if (goldEl) goldEl.textContent = Math.floor(player.gold);

      // 연구
      if (player.currentResearch) {
        const tech = state.techTree ? state.techTree[player.currentResearch] : null;
        const techDisplay = _findTechDisplayName(player.currentResearch);
        const cost = tech ? tech.cost : 100;
        const pct = Math.min(100, Math.floor((player.researchPoints / cost) * 100));
        if (resNameEl) resNameEl.textContent = techDisplay;
        if (resFillEl) resFillEl.style.width = pct + '%';
      } else {
        if (resNameEl) resNameEl.textContent = '없음';
        if (resFillEl) resFillEl.style.width = '0%';
      }

      // 행복도
      if (happyEl) {
        const totalHappiness = player.cities.reduce((sum, c) => sum + (c.happiness || 0), 0);
        happyEl.textContent = `행복: ${totalHappiness}`;
      }

      // 턴 종료 버튼 비활성화 상태
      const endBtn = _el('btn-end-turn');
      if (endBtn) endBtn.disabled = _isAIProcessing;
    },

    // ─────────────────────────────────────────────────────
    // UNIT PANEL
    // ─────────────────────────────────────────────────────
    showUnitPanel(unit) {
      if (!unit) { _hideUnitPanel(); return; }

      const panel = _el('unit-panel');
      if (!panel) return;

      const def = UNITS[unit.type] || { name: unit.type, icon: '?', cost: 0 };
      const hpRatio = unit.hp / unit.maxHp;

      const iconEl = _el('up-icon');
      const nameEl = _el('up-name');
      if (iconEl) iconEl.textContent = def.icon;
      if (nameEl) nameEl.textContent = def.name;

      const hpFill = _el('up-hp-fill');
      if (hpFill) {
        hpFill.style.width = (hpRatio * 100) + '%';
        hpFill.style.background = _hpColor(hpRatio);
      }

      const unitDef = (typeof Game !== 'undefined' && Game.UNITS && Game.UNITS[unit.type]) || {};
      const atkVal = unit.attack != null ? unit.attack : (unitDef.attack != null ? unitDef.attack : '?');
      const defVal = unit.defense != null ? unit.defense : (unitDef.defense != null ? unitDef.defense : '?');
      const statsEl = _el('up-stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <div>HP: <span>${unit.hp}/${unit.maxHp}</span></div>
          <div>이동: <span>${unit.movesLeft}/${unit.maxMoves}</span></div>
          <div>위치: <span>(${unit.x}, ${unit.y})</span></div>
          <div>공격: <span>${atkVal}</span> / 방어: <span>${defVal}</span></div>
        `;
      }

      const actDiv = _el('up-actions');
      if (!actDiv) return;
      actDiv.innerHTML = '';

      // 이동 버튼
      const moveBtn = _createBtn('이동', 'ui-btn', () => {
        UI.showMoveRange(unit);
        UI.showNotification('이동할 타일을 클릭하세요');
      });
      moveBtn.disabled = unit.movesLeft <= 0;
      actDiv.appendChild(moveBtn);

      // 공격 버튼
      const atkBtn = _createBtn('공격', 'ui-btn', () => {
        UI.showMoveRange(unit);
        UI.showNotification('공격할 대상을 우클릭하세요');
      });
      atkBtn.disabled = unit.movesLeft <= 0;
      actDiv.appendChild(atkBtn);

      // 대기 버튼
      actDiv.appendChild(_createBtn('대기', 'ui-btn', () => {
        unit.movesLeft = 0;
        UI.showUnitPanel(unit);
        UI.showMoveRange(unit);
        UI.showNotification('대기 중');
      }));

      // 도시 건설 (개척자만)
      if (unit.type === 'settler') {
        actDiv.appendChild(_createBtn('도시 건설 (B)', 'ui-btn ui-btn-primary', () => {
          _buildCity();
        }));
      }

      // 해산 버튼
      actDiv.appendChild(_createBtn('해산', 'ui-btn ui-btn-danger', () => {
        if (confirm('이 유닛을 해산하시겠습니까?')) {
          if (typeof Game.disbandUnit === 'function') {
            Game.disbandUnit(unit);
          } else {
            const player = _getPlayerCiv();
            if (player) {
              const idx = player.units.indexOf(unit);
              if (idx >= 0) player.units.splice(idx, 1);
            }
          }
          UI.selectedUnit = null;
          _hideUnitPanel();
          _moveRangeTiles = [];
          if (typeof Renderer !== 'undefined') {
            Renderer.moveRange = [];
            if (typeof Renderer.render === 'function') Renderer.render();
          }
        }
      }));

      panel.classList.add('visible');
    },

    // ─────────────────────────────────────────────────────
    // CITY PANEL (모달)
    // ─────────────────────────────────────────────────────
    showCityPanel(city) {
      if (!city) return;
      const player = _getPlayerCiv();
      if (!player) return;

      const foodToGrow = city.population * 15;
      const turnsToGrow = city.foodPerTurn > 0
        ? Math.ceil((foodToGrow - city.food) / city.foodPerTurn) : '∞';

      // 생산 중인 항목
      let prodHtml = '<div class="city-production"><strong>생산 대기열 없음</strong></div>';
      if (city.productionQueue && city.productionQueue.length > 0) {
        const item = city.productionQueue[0];
        const itemName = item.type === 'unit'
          ? (UNITS[item.id] ? UNITS[item.id].name : item.id)
          : (BUILDINGS[item.id] ? BUILDINGS[item.id].name : item.id);
        const totalCost = item.type === 'unit'
          ? (UNITS[item.id] ? UNITS[item.id].cost : 30)
          : (BUILDINGS[item.id] ? BUILDINGS[item.id].cost : 30);
        const progress = totalCost - (item.remaining || 0);
        const pct = Math.min(100, Math.floor((progress / totalCost) * 100));
        const turnsLeft = city.productionPerTurn > 0
          ? Math.ceil(item.remaining / city.productionPerTurn) : '∞';

        prodHtml = `
          <div class="city-production">
            생산 중: <strong>${itemName}</strong> (${progress}/${totalCost}) — ${turnsLeft}턴
            <div class="prod-bar"><div class="prod-fill" style="width:${pct}%"></div></div>
          </div>
        `;
      }

      // 건설 가능 건물
      let buildableHtml = '';
      const allBuildings = Object.entries(BUILDINGS);
      const available = allBuildings.filter(([id]) => !city.buildings.includes(id));
      if (available.length > 0) {
        buildableHtml = '<h3>건설 가능</h3><div class="buildable-grid">';
        for (const [id, b] of available) {
          buildableHtml += `
            <div class="buildable-item" data-build-type="building" data-build-id="${id}">
              <div class="bi-name">${b.name}</div>
              <div class="bi-cost">비용 ${b.cost} · ${b.desc}</div>
            </div>
          `;
        }
        buildableHtml += '</div>';
      }

      // 생산 가능 유닛
      let unitBuildHtml = '<h3>유닛 생산</h3><div class="buildable-grid">';
      const techList = player.technologies || [];
      for (const [id, u] of Object.entries(UNITS)) {
        if (u.tech && !techList.includes(u.tech)) continue;
        unitBuildHtml += `
          <div class="buildable-item" data-build-type="unit" data-build-id="${id}">
            <div class="bi-name">${u.icon} ${u.name}</div>
            <div class="bi-cost">비용 ${u.cost}</div>
          </div>
        `;
      }
      unitBuildHtml += '</div>';

      const cityMaxHp = city.maxHp || 100;
      const hpRatio = city.hp / cityMaxHp;
      const html = `
        <h2>${city.name} (인구 ${city.population}) &nbsp; HP: ${city.hp}/${cityMaxHp}</h2>
        <div class="hp-bar" style="margin-bottom:10px"><div class="hp-fill" style="width:${hpRatio*100}%;background:${_hpColor(hpRatio)}"></div></div>
        <div class="city-stats-grid">
          <div>식량: <span>${city.foodPerTurn}/턴</span> (성장까지 ${turnsToGrow}턴)</div>
          <div>생산: <span>${city.productionPerTurn}/턴</span></div>
          <div>금: <span>${city.goldPerTurn}/턴</span></div>
          <div>연구: <span>${city.researchPerTurn || 0}/턴</span></div>
          <div>행복도: <span>${city.happiness}</span></div>
          <div>방어력: <span>${city.defense}</span></div>
        </div>
        <h3>건물</h3>
        <div class="city-buildings">
          ${city.buildings.length > 0
            ? city.buildings.map(b => `<div class="tag">${BUILDINGS[b] ? BUILDINGS[b].name : b}</div>`).join('')
            : '<div class="tag" style="color:var(--text-dim)">없음</div>'}
        </div>
        ${prodHtml}
        ${buildableHtml}
        ${unitBuildHtml}
        <div class="modal-close-row">
          <button class="ui-btn" id="city-modal-close">닫기 (Esc)</button>
        </div>
      `;

      _renderModal('city', html);

      // 닫기 버튼
      const closeBtn = _el('city-modal-close');
      if (closeBtn) closeBtn.addEventListener('click', () => UI.closeModal());

      // 건설 항목 클릭
      document.querySelectorAll('#modal-city .buildable-item').forEach(el => {
        el.addEventListener('click', () => {
          const type = el.dataset.buildType;
          const id = el.dataset.buildId;
          if (typeof Game.addToProductionQueue === 'function') {
            Game.addToProductionQueue(city, type, id);
          } else if (typeof Game.setProduction === 'function') {
            Game.setProduction(city.id, type, id);
          } else {
            // fallback: 직접 큐에 추가
            const cost = type === 'unit'
              ? (UNITS[id] ? UNITS[id].cost : 30)
              : (BUILDINGS[id] ? BUILDINGS[id].cost : 30);
            city.productionQueue = [{ type, id, remaining: cost, totalCost: cost }];
          }
          UI.showNotification(`${type === 'unit' ? (UNITS[id]?.name || id) : (BUILDINGS[id]?.name || id)} 생산 시작`);
          UI.showCityPanel(city); // 새로고침
        });
      });
    },

    // ─────────────────────────────────────────────────────
    // TECH TREE (모달)
    // ─────────────────────────────────────────────────────
    showTechTree() {
      const player = _getPlayerCiv();
      if (!player) return;
      const researched = player.technologies || [];
      const current = player.currentResearch;

      // 시대별 해금 조건
      const ancientCount = researched.filter(t =>
        TECH_TREE.ancient.some(a => a.id === t)).length;
      const medievalCount = researched.filter(t =>
        TECH_TREE.medieval.some(m => m.id === t)).length;
      const medievalUnlocked = ancientCount >= 3;
      const modernUnlocked = medievalCount >= 3;

      function renderEra(era, label, unlocked) {
        const techs = TECH_TREE[era];
        let cols = era === 'modern' ? 2 : 3;
        let html = `<div class="tech-era">
          <div class="tech-era-label">${label}${unlocked ? '' : ' (잠금 — 이전 시대 3개 필요)'}</div>
          <div class="tech-grid" style="grid-template-columns:repeat(${cols},1fr)">`;

        for (const tech of techs) {
          const isResearched = researched.includes(tech.id);
          const isCurrent = current === tech.id;
          const prereqsMet = tech.prereqs.every(p => researched.includes(p));
          const isAvailable = unlocked && prereqsMet && !isResearched;
          let cls = 'tech-node';
          if (isResearched) cls += ' researched';
          else if (isCurrent) cls += ' current';
          else if (isAvailable) cls += ' available';
          else cls += ' locked';

          let progressInfo = '';
          if (isCurrent) {
            const state = Game.state;
            const techData = state.techTree ? state.techTree[tech.id] : null;
            const cost = techData ? techData.cost : tech.cost;
            const pct = Math.min(100, Math.floor((player.researchPoints / cost) * 100));
            progressInfo = ` (${pct}%)`;
          }

          html += `
            <div class="${cls}" data-tech-id="${tech.id}">
              <div class="tn-name">${tech.name}${progressInfo}</div>
              <div class="tn-cost">${isResearched ? '완료' : `비용 ${tech.cost}`}</div>
            </div>
          `;
        }
        html += '</div></div>';
        return html;
      }

      // 현재 연구 정보
      let currentInfo = '';
      if (current) {
        const techNode = _findTechNode(current);
        const state = Game.state;
        const techData = state.techTree ? state.techTree[current] : null;
        const cost = techData ? techData.cost : (techNode ? techNode.cost : 100);
        const rpPerTurn = player.cities.reduce((s, c) => s + (c.researchPerTurn || 0), 0)
          + player.cities.reduce((s, c) => s + Math.floor(c.population / 2), 0);
        const remaining = cost - player.researchPoints;
        const turnsLeft = rpPerTurn > 0 ? Math.ceil(remaining / rpPerTurn) : '∞';

        currentInfo = `
          <div class="tech-current-info">
            현재 연구: <strong>${techNode ? techNode.name : current}</strong>
            (${player.researchPoints}/${cost}) — 연구력 ${rpPerTurn}/턴, 약 ${turnsLeft}턴 남음
          </div>
        `;
      } else {
        currentInfo = '<div class="tech-current-info">연구 중인 기술이 없습니다. 기술을 선택하세요.</div>';
      }

      const html = `
        <h2>기술 연구 트리</h2>
        ${renderEra('ancient', '고대 시대', true)}
        ${renderEra('medieval', '중세 시대', medievalUnlocked)}
        ${renderEra('modern', '근대 시대', modernUnlocked)}
        ${currentInfo}
        <div class="modal-close-row">
          <button class="ui-btn" id="tech-modal-close">닫기 (Esc)</button>
        </div>
      `;

      _renderModal('tech', html);

      const techCloseBtn = _el('tech-modal-close');
      if (techCloseBtn) techCloseBtn.addEventListener('click', () => UI.closeModal());

      // 기술 노드 클릭
      document.querySelectorAll('#modal-tech .tech-node.available, #modal-tech .tech-node.current').forEach(el => {
        el.addEventListener('click', () => {
          const techId = el.dataset.techId;
          if (typeof Game.setResearch === 'function') {
            Game.setResearch(player.id, techId);
          } else {
            player.currentResearch = techId;
            player.researchPoints = 0;
          }
          const node = _findTechNode(techId);
          UI.showNotification(`${node ? node.name : techId} 연구 시작!`);
          UI.showTechTree(); // 새로고침
        });
      });
    },

    // ─────────────────────────────────────────────────────
    // DIPLOMACY (모달)
    // ─────────────────────────────────────────────────────
    showDiplomacy() {
      const player = _getPlayerCiv();
      if (!player || !player.diplomacy) return;
      const state = Game.state;

      let civsHtml = '';
      for (const civ of state.civilizations) {
        if (civ.id === player.id) continue;
        const diplo = player.diplomacy[civ.id];
        if (!diplo) continue;

        const status = diplo.status || 'neutral';
        const favor = diplo.favor != null ? diplo.favor : 50;
        const civColor = _getCivColorHex(civ.id);
        const statusLabel = DIPLOMACY_STATUS_LABEL[status] || status;

        civsHtml += `
          <div class="diplo-civ">
            <div class="diplo-header">
              <div class="diplo-color" style="background:${civColor}"></div>
              <div class="diplo-name">${civ.name}</div>
              <div class="diplo-status ${status}">${statusLabel}</div>
            </div>
            <div class="diplo-favor">호감도: ${favor} · ${civ.personality || '알 수 없음'} 성향</div>
            <div class="diplo-actions">
              ${status !== 'war' ? `
                <button class="ui-btn" data-diplo-action="trade" data-diplo-civ="${civ.id}">교역 제안</button>
                <button class="ui-btn ui-btn-danger" data-diplo-action="war" data-diplo-civ="${civ.id}">선전포고</button>
              ` : `
                <button class="ui-btn" data-diplo-action="peace" data-diplo-civ="${civ.id}">평화 조약</button>
              `}
            </div>
          </div>
        `;
      }

      const html = `
        <h2>외교</h2>
        ${civsHtml || '<p style="color:var(--text-dim)">다른 문명이 없습니다.</p>'}
        <div class="modal-close-row">
          <button class="ui-btn" id="diplo-modal-close">닫기 (Esc)</button>
        </div>
      `;

      _renderModal('diplo', html);

      const diploCloseBtn = _el('diplo-modal-close');
      if (diploCloseBtn) diploCloseBtn.addEventListener('click', () => UI.closeModal());

      // 외교 액션 버튼
      document.querySelectorAll('[data-diplo-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.diploAction;
          const civId = parseInt(btn.dataset.diploCiv);
          if (typeof Game.diplomacyAction === 'function') {
            const result = Game.diplomacyAction(player.id, civId, action);
            UI.showNotification(result?.message || `${action} 실행`);
          } else {
            // fallback
            const diplo = player.diplomacy[civId];
            if (action === 'war') {
              diplo.status = 'war';
              diplo.favor = Math.max(0, diplo.favor - 30);
              UI.showNotification('선전포고!');
            } else if (action === 'peace') {
              diplo.status = 'neutral';
              UI.showNotification('평화 조약 체결');
            } else if (action === 'trade') {
              diplo.favor = Math.min(100, diplo.favor + 15);
              if (diplo.favor >= 60) diplo.status = 'friendly';
              UI.showNotification('교역 제안 수락');
            }
          }
          UI.showDiplomacy(); // 새로고침
        });
      });
    },

    // ─────────────────────────────────────────────────────
    // MAIN MENU
    // ─────────────────────────────────────────────────────
    showMainMenu() {
      const hasSave = !!localStorage.getItem('miniCiv_save');

      const overlay = document.createElement('div');
      overlay.className = 'main-menu-overlay';
      overlay.id = 'main-menu';
      overlay.innerHTML = `
        <div class="main-menu-title">⚔ 미니 문명</div>
        <div class="main-menu-sub">턴제 전략 시뮬레이터</div>
        <div class="main-menu-btns">
          <button class="ui-btn ui-btn-primary" id="menu-new-game">새 게임</button>
          <button class="ui-btn" id="menu-continue" ${hasSave ? '' : 'disabled'}>이어하기</button>
          <button class="ui-btn" id="menu-settings">설정</button>
          ${Game.state ? '<button class="ui-btn" id="menu-resume">게임으로 돌아가기</button>' : ''}
        </div>
      `;

      // 이전 메뉴 제거
      const old = _el('main-menu');
      if (old) old.remove();

      document.body.appendChild(overlay);

      _el('menu-new-game').addEventListener('click', () => {
        if (Game.state && !confirm('현재 게임을 포기하고 새 게임을 시작할까요?')) return;
        overlay.remove();
        if (typeof Game.newGame === 'function') {
          Game.newGame();
          UI.updateHUD();
          if (typeof Renderer.render === 'function') Renderer.render();
        }
      });

      if (hasSave) {
        _el('menu-continue').addEventListener('click', () => {
          overlay.remove();
          if (typeof Game.load === 'function') {
            Game.load();
            UI.updateHUD();
            if (typeof Renderer.render === 'function') Renderer.render();
          }
        });
      }

      _el('menu-settings')?.addEventListener('click', () => {
        UI.showNotification('설정 기능은 준비 중입니다');
      });

      const resumeBtn = _el('menu-resume');
      if (resumeBtn) {
        resumeBtn.addEventListener('click', () => overlay.remove());
      }
    },

    // ─────────────────────────────────────────────────────
    // GAME OVER
    // ─────────────────────────────────────────────────────
    showGameOver(winner, condition) {
      const player = _getPlayerCiv();
      const isVictory = player && winner === player.id;

      const conditionLabels = {
        military: '군사 승리 — 모든 적 수도 점령',
        technology: '기술 승리 — 우주 프로그램 완성',
        score: '점수 승리 — 100턴 종료',
      };

      // 점수 계산
      let score = 0;
      if (player) {
        score += (player.cities?.length || 0) * 20;
        score += player.cities?.reduce((s, c) => s + c.population, 0) * 5 || 0;
        score += (player.technologies?.length || 0) * 10;
        score += (player.units?.length || 0) * 3;
        score += Math.floor((player.gold || 0) / 10);
      }

      const html = `
        <div class="gameover-result ${isVictory ? 'victory' : 'defeat'}">
          ${isVictory ? '승리!' : '패배...'}
        </div>
        <div class="gameover-condition">${conditionLabels[condition] || condition}</div>
        <div class="gameover-score">최종 점수: <strong style="color:var(--accent)">${score}</strong>점</div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:14px">
          도시 ${player?.cities?.length || 0}개 ·
          인구 ${player?.cities?.reduce((s,c)=>s+c.population,0) || 0} ·
          기술 ${player?.technologies?.length || 0}개 ·
          유닛 ${player?.units?.length || 0}개
        </div>
        <div class="modal-close-row">
          <button class="ui-btn ui-btn-primary" id="gameover-new">새 게임</button>
          <button class="ui-btn" id="gameover-menu">메인 메뉴</button>
        </div>
      `;

      _renderModal('gameover', html);

      const goNewBtn = _el('gameover-new');
      if (goNewBtn) goNewBtn.addEventListener('click', () => {
        UI.closeModal();
        if (typeof Game.newGame === 'function') Game.newGame();
        UI.updateHUD();
        if (typeof Renderer.render === 'function') Renderer.render();
      });

      const goMenuBtn = _el('gameover-menu');
      if (goMenuBtn) goMenuBtn.addEventListener('click', () => {
        UI.closeModal();
        UI.showMainMenu();
      });
    },

    // ─────────────────────────────────────────────────────
    // NOTIFICATION
    // ─────────────────────────────────────────────────────
    showNotification(text) {
      const container = _el('notification-container') || _el('notification-area');
      if (!container) return;

      const notif = document.createElement('div');
      notif.className = 'notification';
      notif.textContent = text;
      container.appendChild(notif);

      // 3초 후 제거
      setTimeout(() => {
        if (notif.parentNode) notif.parentNode.removeChild(notif);
      }, 3200);
    },

    // ─────────────────────────────────────────────────────
    // CLOSE MODAL
    // ─────────────────────────────────────────────────────
    closeModal() {
      _clearModal();
    },

    // ─────────────────────────────────────────────────────
    // TURN FLOW
    // ─────────────────────────────────────────────────────
    updateAll: function() {
      UI.updateHUD();
      // Update any open panels
      if (UI.selectedUnit) UI.showUnitPanel(UI.selectedUnit);
      if (UI.selectedCity) UI.showCityPanel(UI.selectedCity);
    },

    notify: function(msg, type) {
      UI.showNotification(msg, type);
    },

    endTurn() {
      if (_isAIProcessing) return;
      if (!Game.state) return;

      // 이동 안 한 유닛 체크
      const player = _getPlayerCiv();
      if (player) {
        const unmovedUnits = player.units.filter(u => u.movesLeft > 0);
        if (unmovedUnits.length > 0) {
          if (!confirm(`이동하지 않은 유닛이 ${unmovedUnits.length}개 있습니다. 턴을 종료할까요?`)) {
            return;
          }
        }
      }

      _isAIProcessing = true;
      UI.selectedUnit = null;
      UI.selectedCity = null;
      _hideUnitPanel();
      _moveRangeTiles = [];
      if (typeof Renderer !== 'undefined') Renderer.moveRange = [];

      // 1) 다음 턴 진행
      if (typeof Game.nextTurn === 'function') {
        Game.nextTurn();
      }

      UI.updateHUD();
      UI.showNotification(`턴 ${Game.state.turn}`);

      // 2) 승리 체크
      if (Game.state.winner != null) {
        _isAIProcessing = false;
        UI.showGameOver(Game.state.winner, Game.state.winCondition);
        return;
      }

      // 3) AI 턴 처리 (비동기 — 순차적으로 각 AI)
      const aiCivs = Game.state.civilizations.filter(c => c.isAI);
      _processAITurns(aiCivs, 0, () => {
        _isAIProcessing = false;
        UI.updateHUD();
        if (typeof Renderer !== 'undefined' && typeof Renderer.render === 'function') {
          Renderer.render();
        }

        // 턴 후 승리 재체크
        if (Game.state.winner != null) {
          UI.showGameOver(Game.state.winner, Game.state.winCondition);
        }
      });
    },
  };

  // ─── 내부 헬퍼 ─────────────────────────────────────────

  function _deselect() {
    UI.selectedUnit = null;
    UI.selectedCity = null;
    _moveRangeTiles = [];
    _hideUnitPanel();
    if (typeof Renderer !== 'undefined') {
      Renderer.selectedHex = null;
      Renderer.moveRange = [];
      if (typeof Renderer.render === 'function') Renderer.render();
    }
  }

  function _hideUnitPanel() {
    const panel = _el('unit-panel');
    if (panel) panel.classList.remove('visible');
  }

  function _createBtn(text, cls, onClick) {
    const btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function _findTechNode(techId) {
    for (const era of Object.values(TECH_TREE)) {
      const node = era.find(t => t.id === techId);
      if (node) return node;
    }
    return null;
  }

  function _findTechDisplayName(techId) {
    const node = _findTechNode(techId);
    return node ? node.name : techId;
  }

  function _getTerrainMoveCost(terrain) {
    const costs = {
      plains: 1, grass: 1, forest: 2, mountain: 3,
      desert: 1, water: Infinity, hills: 2,
    };
    return costs[terrain] || 1;
  }

  function _getHexNeighbors(col, row) {
    // offset coordinates (홀수 행 오른쪽 오프셋)
    const isOdd = row % 2 === 1;
    if (isOdd) {
      return [
        { col: col + 1, row: row - 1 },
        { col: col,     row: row - 1 },
        { col: col + 1, row: row },
        { col: col - 1, row: row },
        { col: col + 1, row: row + 1 },
        { col: col,     row: row + 1 },
      ];
    } else {
      return [
        { col: col,     row: row - 1 },
        { col: col - 1, row: row - 1 },
        { col: col + 1, row: row },
        { col: col - 1, row: row },
        { col: col,     row: row + 1 },
        { col: col - 1, row: row + 1 },
      ];
    }
  }

  function _buildCity() {
    if (!UI.selectedUnit || UI.selectedUnit.type !== 'settler') {
      UI.showNotification('개척자를 선택한 뒤 도시를 건설하세요');
      return;
    }
    if (typeof Game.buildCity === 'function') {
      const result = Game.buildCity(UI.selectedUnit);
      if (result && result.city) {
        UI.showNotification(`${result.city.name} 건설!`);
        UI.selectedUnit = null;
        _hideUnitPanel();
        _moveRangeTiles = [];
      } else {
        UI.showNotification(result?.error || '여기에 도시를 건설할 수 없습니다');
      }
    }
    UI.updateHUD();
    if (typeof Renderer !== 'undefined' && typeof Renderer.render === 'function') {
      Renderer.render();
    }
  }

  function _afterUnitAction(unit) {
    if (unit && unit.hp > 0) {
      UI.showUnitPanel(unit);
      UI.showMoveRange(unit);
    } else {
      UI.selectedUnit = null;
      _hideUnitPanel();
      _moveRangeTiles = [];
      if (typeof Renderer !== 'undefined') Renderer.moveRange = [];
    }
    UI.updateHUD();
    if (typeof Renderer !== 'undefined' && typeof Renderer.render === 'function') {
      Renderer.render();
    }
  }

  function _moveTowards(unit, targetCol, targetRow, callback) {
    if (typeof HexMap !== 'undefined' && typeof HexMap.findPath === 'function') {
      const path = HexMap.findPath(unit.x, unit.y, targetCol, targetRow, Game.state.tiles, Game.state.mapWidth, Game.state.mapHeight);
      if (path && path.length > 0) {
        // 경로의 마지막 직전 칸까지 이동 (대상 한 칸 앞에 멈춤)
        const stopPath = path.slice(0, -1);
        if (stopPath.length > 0) {
          _animateMovePath(unit, stopPath, callback);
          return;
        }
      }
    }
    if (callback) callback();
  }

  function _animateMovePath(unit, path, callback) {
    if (!path || path.length === 0) {
      if (callback) callback();
      return;
    }

    let stepIdx = 0;
    function nextStep() {
      if (stepIdx >= path.length) {
        if (callback) callback();
        return;
      }
      const target = path[stepIdx];
      stepIdx++;

      if (typeof Renderer !== 'undefined' && typeof Renderer.animateMove === 'function') {
        Renderer.animateMove(unit, [{col: unit.x, row: unit.y}, {col: target.col || target.x, row: target.row || target.y}], () => {
          if (typeof Game.moveUnit === 'function') {
            Game.moveUnit(unit, target.col || target.x, target.row || target.y);
          }
          nextStep();
        });
      } else {
        if (typeof Game.moveUnit === 'function') {
          Game.moveUnit(unit, target.col || target.x, target.row || target.y);
        }
        nextStep();
      }
    }
    nextStep();
  }

  function _processAITurns(aiCivs, index, callback) {
    if (index >= aiCivs.length) {
      if (callback) callback();
      return;
    }

    const civ = aiCivs[index];

    if (typeof AI !== 'undefined' && typeof AI.processTurn === 'function') {
      const actions = AI.processTurn(civ.id);

      if (actions && Array.isArray(actions) && actions.length > 0) {
        _animateAIActions(actions, 0, () => {
          _processAITurns(aiCivs, index + 1, callback);
        });
      } else {
        // AI 처리가 즉시 완료되는 경우
        requestAnimationFrame(() => {
          if (typeof Renderer !== 'undefined' && typeof Renderer.render === 'function') {
            Renderer.render();
          }
          _processAITurns(aiCivs, index + 1, callback);
        });
      }
    } else {
      // AI 시스템 미구현 시 스킵
      _processAITurns(aiCivs, index + 1, callback);
    }
  }

  function _animateAIActions(actions, index, callback) {
    if (index >= actions.length) {
      if (callback) callback();
      return;
    }

    const action = actions[index];

    if (action.type === 'move' && typeof Renderer !== 'undefined' && typeof Renderer.animateMove === 'function') {
      Renderer.animateMove(action.unit, [{col: action.unit.x, row: action.unit.y}, {col: action.toX, row: action.toY}], () => {
        _animateAIActions(actions, index + 1, callback);
      });
    } else if (action.type === 'combat') {
      UI.showNotification(action.message || '전투 발생!');
      if (typeof Renderer !== 'undefined' && typeof Renderer.render === 'function') Renderer.render();
      setTimeout(() => {
        _animateAIActions(actions, index + 1, callback);
      }, 400);
    } else if (action.type === 'build_city') {
      UI.showNotification(`${action.civName || 'AI'}: ${action.cityName || '도시'} 건설`);
      if (typeof Renderer !== 'undefined' && typeof Renderer.render === 'function') Renderer.render();
      setTimeout(() => {
        _animateAIActions(actions, index + 1, callback);
      }, 300);
    } else if (action.type === 'diplomacy') {
      UI.showNotification(action.message || '외교 변동');
      setTimeout(() => {
        _animateAIActions(actions, index + 1, callback);
      }, 300);
    } else {
      // 알 수 없는 액션 타입 — 스킵
      requestAnimationFrame(() => {
        _animateAIActions(actions, index + 1, callback);
      });
    }
  }

  return UI;
})();
