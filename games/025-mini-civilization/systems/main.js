/**
 * Main.js - 게임 초기화 및 메인 루프
 *
 * 모든 시스템 모듈을 초기화하고 연결하는 엔트리 포인트.
 * DOMContentLoaded에서 Main.init()을 호출하여 시작.
 *
 * 의존성: core.js, map.js, renderer.js, ai.js, ui.js
 */

window.Main = {
  /** @type {boolean} 게임이 진행 중인지 여부 */
  isRunning: false,

  /** @type {boolean} AI 턴 처리 중인지 여부 */
  isAITurn: false,

  /** @type {number} requestAnimationFrame ID */
  animFrameId: null,

  /** @type {number} 마지막 프레임 타임스탬프 */
  lastFrameTime: 0,

  /**
   * 초기화 - DOMContentLoaded에서 호출
   * 모든 시스템을 초기화하고 메인 메뉴를 표시
   */
  init() {
    console.log('[Main] 미니 문명 시뮬레이터 초기화...');

    // 캔버스 참조
    const mapCanvas = document.getElementById('map-canvas');
    const minimapCanvas = document.getElementById('minimap-canvas');

    if (!mapCanvas || !minimapCanvas) {
      console.error('[Main] 캔버스 요소를 찾을 수 없습니다.');
      return;
    }

    // 캔버스 크기를 컨테이너에 맞춤
    this.resizeCanvases();
    window.addEventListener('resize', () => this.resizeCanvases());

    // 시스템 초기화 (존재하는 경우에만)
    if (window.Assets && typeof Assets.init === 'function') {
      try {
        Assets.init();
        console.log('[Main] Assets 시스템 초기화 완료');
      } catch (e) {
        console.error('[Main] Assets 초기화 실패:', e);
      }
    }

    if (window.Game && typeof Game.init === 'function') {
      Game.init();
      console.log('[Main] Game(core) 시스템 초기화 완료');
    }

    if (window.HexMap && typeof HexMap.init === 'function') {
      HexMap.init();
      console.log('[Main] HexMap 시스템 초기화 완료');
    }

    if (window.Renderer && typeof Renderer.init === 'function') {
      Renderer.init(mapCanvas, minimapCanvas);
      console.log('[Main] Renderer 시스템 초기화 완료');
    }

    if (window.AI && typeof AI.init === 'function') {
      AI.init();
      console.log('[Main] AI 시스템 초기화 완료');
    }

    if (window.UI && typeof UI.init === 'function') {
      UI.init();
      console.log('[Main] UI 시스템 초기화 완료');
    }

    // 이어하기 버튼 활성화 여부 확인
    this.checkSaveExists();

    // 메인 메뉴 표시
    this.showMainMenu();

    // 키보드 바인딩
    this.setupKeyboard();

    console.log('[Main] 초기화 완료');
  },

  /**
   * 캔버스 크기를 부모 컨테이너에 맞춤
   */
  resizeCanvases() {
    const mapCanvas = document.getElementById('map-canvas');
    const minimapCanvas = document.getElementById('minimap-canvas');
    const canvasArea = document.getElementById('canvas-area');

    if (mapCanvas && canvasArea) {
      const rect = canvasArea.getBoundingClientRect();
      mapCanvas.width = rect.width * (window.devicePixelRatio || 1);
      mapCanvas.height = rect.height * (window.devicePixelRatio || 1);
      mapCanvas.style.width = rect.width + 'px';
      mapCanvas.style.height = rect.height + 'px';
    }

    if (minimapCanvas) {
      const container = document.getElementById('minimap-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        minimapCanvas.width = rect.width * (window.devicePixelRatio || 1);
        minimapCanvas.height = rect.height * (window.devicePixelRatio || 1);
      }
    }

    // Renderer에게 리사이즈 알림
    if (window.Renderer && typeof Renderer.onResize === 'function') {
      Renderer.onResize();
    }
  },

  /**
   * 저장 데이터 존재 여부 확인
   */
  checkSaveExists() {
    const btn = document.getElementById('btn-continue-game');
    if (!btn) return;

    try {
      const saveData = localStorage.getItem('miniCiv_save');
      if (saveData) {
        const parsed = JSON.parse(saveData);
        if (parsed && parsed.version && parsed.gameState) {
          btn.disabled = false;
          btn.title = '저장된 게임을 이어서 플레이합니다';
          return;
        }
      }
    } catch (e) {
      console.warn('[Main] 저장 데이터 확인 실패:', e);
    }

    btn.disabled = true;
  },

  /**
   * 메인 메뉴 표시
   */
  showMainMenu() {
    const modal = document.getElementById('main-menu-modal');
    if (modal) {
      modal.classList.add('active');
    }

    // 게임 루프 중지
    this.stopGameLoop();
    this.isRunning = false;

    // 메뉴 버튼 이벤트
    const newGameBtn = document.getElementById('btn-new-game');
    const continueBtn = document.getElementById('btn-continue-game');
    const howToBtn = document.getElementById('btn-how-to-play');

    if (newGameBtn) {
      newGameBtn.onclick = () => this.newGame();
    }

    if (continueBtn) {
      continueBtn.onclick = () => {
        if (!continueBtn.disabled) {
          this.continueGame();
        }
      };
    }

    if (howToBtn) {
      howToBtn.onclick = () => {
        const howtoModal = document.getElementById('howto-modal');
        if (howtoModal) howtoModal.classList.add('active');
      };
    }

    // 조작법 닫기
    const howtoCloseBtn = document.getElementById('howto-close-btn');
    if (howtoCloseBtn) {
      howtoCloseBtn.onclick = () => {
        const howtoModal = document.getElementById('howto-modal');
        if (howtoModal) howtoModal.classList.remove('active');
      };
    }
  },

  /**
   * 메인 메뉴 숨김
   */
  hideMainMenu() {
    const modal = document.getElementById('main-menu-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  },

  /**
   * 새 게임 시작
   */
  newGame() {
    console.log('[Main] 새 게임 시작...');

    // 로딩 표시
    this.showLoading('맵 생성 중...');

    // 메인 메뉴 숨김
    this.hideMainMenu();

    // 비동기적으로 맵 생성 (UI 블로킹 방지)
    requestAnimationFrame(() => {
      try {
        // 게임 상태 초기화
        if (window.Game && typeof Game.newGame === 'function') {
          Game.newGame();
        }

        // 맵 생성
        if (window.HexMap && typeof HexMap.generate === 'function') {
          this.updateLoading('맵 생성 중...');
          HexMap.generate();
        }

        // 문명 배치
        if (window.Game && typeof Game.placeCivilizations === 'function') {
          this.updateLoading('문명 배치 중...');
          Game.placeCivilizations();
        }

        // AI 초기화
        if (window.AI && typeof AI.reset === 'function') {
          this.updateLoading('AI 초기화 중...');
          AI.reset();
        }

        // 렌더러 리셋
        if (window.Renderer && typeof Renderer.reset === 'function') {
          Renderer.reset();
        }

        // UI 업데이트
        if (window.UI && typeof UI.updateAll === 'function') {
          UI.updateAll();
        }

        // 로딩 숨김 & 게임 시작
        this.hideLoading();
        this.isRunning = true;
        this.startGameLoop();

        console.log('[Main] 새 게임 시작 완료');
      } catch (e) {
        console.error('[Main] 새 게임 시작 실패:', e);
        this.hideLoading();
        this.showMainMenu();
      }
    });
  },

  /**
   * 저장된 게임 이어하기
   */
  continueGame() {
    console.log('[Main] 저장된 게임 불러오기...');

    this.showLoading('저장 데이터 불러오는 중...');
    this.hideMainMenu();

    requestAnimationFrame(() => {
      try {
        const saveRaw = localStorage.getItem('miniCiv_save');
        if (!saveRaw) {
          throw new Error('저장 데이터가 없습니다.');
        }

        const saveData = JSON.parse(saveRaw);
        if (!saveData || !saveData.gameState) {
          throw new Error('유효하지 않은 저장 데이터입니다.');
        }

        // 게임 상태 복원
        if (window.Game && typeof Game.loadState === 'function') {
          Game.loadState(saveData.gameState);
        }

        // HexMap 복원
        if (window.HexMap && typeof HexMap.loadState === 'function') {
          HexMap.loadState(saveData.gameState);
        }

        // 렌더러 리셋
        if (window.Renderer && typeof Renderer.reset === 'function') {
          Renderer.reset();
        }

        // AI 복원
        if (window.AI && typeof AI.reset === 'function') {
          AI.reset();
        }

        // UI 전체 업데이트
        if (window.UI && typeof UI.updateAll === 'function') {
          UI.updateAll();
        }

        this.hideLoading();
        this.isRunning = true;
        this.startGameLoop();

        // 알림
        if (window.UI && typeof UI.notify === 'function') {
          UI.notify('저장된 게임을 불러왔습니다.', 'success');
        }

        console.log('[Main] 게임 불러오기 완료, 턴:', saveData.gameState.turn || '?');
      } catch (e) {
        console.error('[Main] 게임 불러오기 실패:', e);
        this.hideLoading();
        this.showMainMenu();

        if (window.UI && typeof UI.notify === 'function') {
          UI.notify('저장 데이터를 불러올 수 없습니다.', 'warning');
        }
      }
    });
  },

  /**
   * 게임 저장
   */
  saveGame() {
    if (!this.isRunning) return;

    try {
      const gameState = {};

      if (window.Game && typeof Game.getState === 'function') {
        Object.assign(gameState, Game.getState());
      }

      const saveData = {
        version: 1,
        timestamp: Date.now(),
        gameState: gameState
      };

      localStorage.setItem('miniCiv_save', JSON.stringify(saveData));
      this.checkSaveExists();

      if (window.UI && typeof UI.notify === 'function') {
        UI.notify('게임이 저장되었습니다.', 'success');
      }

      console.log('[Main] 게임 저장 완료');
    } catch (e) {
      console.error('[Main] 게임 저장 실패:', e);
      if (window.UI && typeof UI.notify === 'function') {
        UI.notify('저장에 실패했습니다.', 'warning');
      }
    }
  },

  /**
   * 턴 종료 처리
   */
  endTurn() {
    if (!this.isRunning || this.isAITurn) return;

    console.log('[Main] 턴 종료 처리...');

    // 플레이어 턴 종료 처리
    if (window.Game && typeof Game.endPlayerTurn === 'function') {
      Game.endPlayerTurn();
    }

    // AI 턴 처리
    this.isAITurn = true;
    this.processAITurns();
  },

  /**
   * AI 턴을 순차적으로 처리
   */
  processAITurns() {
    if (!window.Game || !window.Game.state) {
      this.finishAITurns();
      return;
    }

    const civs = Game.state.civilizations || [];
    let aiIndex = 0;

    const processNext = () => {
      // 다음 AI 문명 찾기
      while (aiIndex < civs.length && !civs[aiIndex].isAI) {
        aiIndex++;
      }

      if (aiIndex >= civs.length) {
        // 모든 AI 처리 완료
        this.finishAITurns();
        return;
      }

      const aiCiv = civs[aiIndex];
      console.log(`[Main] AI 턴 처리: ${aiCiv.name}`);

      if (window.AI && typeof AI.processTurn === 'function') {
        AI.processTurn(aiCiv.id);
      }

      aiIndex++;

      // 다음 AI는 약간의 딜레이 후 처리 (애니메이션 시간)
      requestAnimationFrame(processNext);
    };

    requestAnimationFrame(processNext);
  },

  /**
   * AI 턴 완료 후 새 턴 시작
   */
  finishAITurns() {
    this.isAITurn = false;

    // 새 턴 시작
    if (window.Game && typeof Game.startNewTurn === 'function') {
      Game.startNewTurn();
    }

    // UI 업데이트
    if (window.UI && typeof UI.updateAll === 'function') {
      UI.updateAll();
    }

    // 승리 조건 확인
    this.checkVictory();

    // 자동 저장 (매 5턴)
    if (window.Game && Game.state && Game.state.turn % 5 === 0) {
      this.saveGame();
    }

    console.log('[Main] 새 턴 시작:', window.Game ? Game.state.turn : '?');
  },

  /**
   * 승리 조건 확인
   */
  checkVictory() {
    if (!window.Game || !Game.state) return;

    if (Game.state.winner !== null && Game.state.winner !== undefined) {
      this.isRunning = false;
      this.showGameOver(Game.state.winner, Game.state.winCondition);
    }

    // 100턴 도달 시 점수 승리
    if (Game.state.turn > 100 && Game.state.winner === null) {
      if (typeof Game.calculateScoreVictory === 'function') {
        Game.calculateScoreVictory();
        if (Game.state.winner !== null) {
          this.isRunning = false;
          this.showGameOver(Game.state.winner, 'score');
        }
      }
    }
  },

  /**
   * 게임 오버 표시
   */
  showGameOver(winnerId, condition) {
    if (window.UI && typeof UI.showGameOver === 'function') {
      UI.showGameOver(winnerId, condition);
    } else {
      // 폴백: 직접 모달 표시
      const modal = document.getElementById('gameover-modal');
      const resultEl = document.getElementById('gameover-result');
      const conditionEl = document.getElementById('gameover-condition');

      if (modal) {
        const isPlayerWin = winnerId === 0;
        if (resultEl) {
          resultEl.textContent = isPlayerWin ? '승리!' : '패배...';
          resultEl.className = 'gameover-result ' + (isPlayerWin ? 'victory' : 'defeat');
        }
        if (conditionEl) {
          const conditionText = {
            military: '군사 승리 - 모든 적 수도를 점령했습니다!',
            technology: '기술 승리 - 우주 프로그램을 완성했습니다!',
            score: '점수 승리 - 100턴 종료 시 최고 점수!',
          };
          conditionEl.textContent = conditionText[condition] || condition;
        }
        modal.classList.add('active');
      }
    }

    // 게임 오버 버튼 이벤트
    const newGameBtn = document.getElementById('gameover-new-game');
    const menuBtn = document.getElementById('gameover-menu');

    if (newGameBtn) {
      newGameBtn.onclick = () => {
        const modal = document.getElementById('gameover-modal');
        if (modal) modal.classList.remove('active');
        this.newGame();
      };
    }

    if (menuBtn) {
      menuBtn.onclick = () => {
        const modal = document.getElementById('gameover-modal');
        if (modal) modal.classList.remove('active');
        this.showMainMenu();
      };
    }
  },

  /**
   * 메인 게임 렌더링 루프 시작
   */
  startGameLoop() {
    if (this.animFrameId) return;

    const loop = (timestamp) => {
      const delta = timestamp - this.lastFrameTime;
      this.lastFrameTime = timestamp;

      // 렌더링 (매 프레임)
      if (window.Renderer && typeof Renderer.render === 'function') {
        Renderer.render(delta);
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.lastFrameTime = performance.now();
    this.animFrameId = requestAnimationFrame(loop);
    console.log('[Main] 게임 루프 시작');
  },

  /**
   * 게임 루프 중지
   */
  stopGameLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
      console.log('[Main] 게임 루프 중지');
    }
  },

  /**
   * 로딩 오버레이 표시
   */
  showLoading(text) {
    const overlay = document.getElementById('loading-overlay');
    const textEl = document.getElementById('loading-text');
    if (overlay) overlay.classList.add('active');
    if (textEl && text) textEl.textContent = text;
  },

  /**
   * 로딩 텍스트 업데이트
   */
  updateLoading(text) {
    const textEl = document.getElementById('loading-text');
    if (textEl && text) textEl.textContent = text;
  },

  /**
   * 로딩 오버레이 숨김
   */
  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');
  },

  /**
   * 키보드 단축키 설정
   */
  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      // 모달이 열려 있으면 ESC로 닫기
      if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal-overlay.active');
        if (modals.length > 0) {
          // 메인 메뉴와 게임 오버는 닫지 않음
          modals.forEach(m => {
            if (m.id !== 'main-menu-modal' && m.id !== 'gameover-modal') {
              m.classList.remove('active');
            }
          });
          return;
        }
      }

      // 게임 진행 중이 아니면 무시
      if (!this.isRunning || this.isAITurn) return;

      // 모달 열려 있으면 게임 단축키 무시
      const anyModalOpen = document.querySelector('.modal-overlay.active');
      if (anyModalOpen) return;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          this.endTurn();
          break;
        case 't':
        case 'T':
          e.preventDefault();
          document.getElementById('btn-tech-tree')?.click();
          break;
        case 'd':
        case 'D':
          e.preventDefault();
          document.getElementById('btn-diplomacy')?.click();
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          document.getElementById('btn-found-city')?.click();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          // 유닛 빠른 선택
          if (window.UI && typeof UI.selectUnitByIndex === 'function') {
            UI.selectUnitByIndex(parseInt(e.key) - 1);
          }
          break;
      }
    });
  },

  /**
   * 확인 다이얼로그 표시
   * @param {string} message 메시지
   * @param {function} onConfirm 확인 콜백
   * @param {function} [onCancel] 취소 콜백
   */
  confirm(message, onConfirm, onCancel) {
    const dialog = document.getElementById('confirm-dialog');
    const msgEl = document.getElementById('confirm-message');
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');

    if (!dialog || !msgEl) return;

    msgEl.textContent = message;
    dialog.classList.add('active');

    const close = () => {
      dialog.classList.remove('active');
      yesBtn.onclick = null;
      noBtn.onclick = null;
    };

    yesBtn.onclick = () => {
      close();
      if (onConfirm) onConfirm();
    };

    noBtn.onclick = () => {
      close();
      if (onCancel) onCancel();
    };
  }
};

// ===== DOMContentLoaded에서 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  Main.init();
});
