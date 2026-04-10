/**
 * renderer.js — Renderer namespace
 * Canvas rendering for hex map, units, cities, fog of war, minimap, and animations.
 * Namespace: window.Renderer
 * Depends on: window.HexMap (map.js)
 */
(function () {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────────

  const COLORS = {
    background: '#1a1a2e',
    panel:      '#16213e',
    text:       '#e8e8e8',
    accent:     '#f0a500',
    gridLine:   'rgba(255,255,255,0.08)',
    fogBlack:   'rgba(0,0,0,0.95)',
    fogGray:    'rgba(0,0,0,0.50)',
    selectedHighlight: 'rgba(255,255,255,0.3)',
    moveRange:  'rgba(67,97,238,0.25)',
    moveRangeBorder: 'rgba(67,97,238,0.6)',
  };

  const CIV_COLORS = ['#4361ee', '#e63946', '#2a9d8f'];

  const UNIT_ICONS = {
    warrior:  '\u2694',  // ⚔
    archer:   '\uD83C\uDFF9', // 🏹
    knight:   '\uD83D\uDC0E', // 🐎
    siege:    '\uD83D\uDCA3', // 💣
    musket:   '\uD83D\uDD2B', // 🔫
    settler:  '\uD83C\uDFE0', // 🏠
  };

  const RESOURCE_ICONS = {
    horse: '\uD83D\uDC0E', // 🐎
    iron:  '\u2692',       // ⚒
    gem:   '\uD83D\uDC8E', // 💎
  };

  // ─── State ─────────────────────────────────────────────────────

  let _canvas = null;
  let _ctx = null;
  let _minimapCanvas = null;
  let _minimapCtx = null;

  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
    minZoom: 0.4,
    maxZoom: 2.5,
    // Hex size in pixels (before zoom)
    hexSize: 28,

    pan(dx, dy) {
      this.x += dx;
      this.y += dy;
    },

    zoomAt(delta, screenX, screenY) {
      const oldZoom = this.zoom;
      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + delta));
      // Adjust pan so the point under the cursor stays fixed
      const zoomRatio = this.zoom / oldZoom;
      this.x = screenX - (screenX - this.x) * zoomRatio;
      this.y = screenY - (screenY - this.y) * zoomRatio;
    },

    centerOn(worldX, worldY, canvasW, canvasH) {
      this.x = canvasW / 2 - worldX * this.zoom;
      this.y = canvasH / 2 - worldY * this.zoom;
    },
  };

  // ─── Active animations ────────────────────────────────────────

  const _animations = [];

  // ─── Init ──────────────────────────────────────────────────────

  function init(canvas, minimapCanvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
    if (minimapCanvas) {
      _minimapCanvas = minimapCanvas;
      _minimapCtx = minimapCanvas.getContext('2d');
    }
  }

  // ─── Coordinate conversion ────────────────────────────────────

  function worldToScreen(wx, wy) {
    return {
      x: wx * camera.zoom + camera.x,
      y: wy * camera.zoom + camera.y,
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - camera.x) / camera.zoom,
      y: (sy - camera.y) / camera.zoom,
    };
  }

  // ─── Drawing helpers ──────────────────────────────────────────

  function _drawHexPath(ctx, cx, cy, size) {
    const corners = HexMap.hexCorners(cx, cy, size);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
  }

  function _getTerrainColor(terrain) {
    const t = HexMap.TERRAINS[terrain];
    return t ? t.color : '#333';
  }

  // ─── Main draw ────────────────────────────────────────────────

  /**
   * Full frame render.
   * gameState: { tiles[], civilizations[], mapWidth, mapHeight }
   * playerCivId: index of the player civilization (for fog of war)
   */
  function draw(gameState, playerCivId) {
    if (!_canvas || !_ctx) return;
    const ctx = _ctx;
    const W = _canvas.width;
    const H = _canvas.height;
    const size = camera.hexSize;

    // Clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    const mapW = gameState.mapWidth || 20;
    const mapH = gameState.mapHeight || 15;
    const tiles = gameState.tiles;

    // Determine currently visible tiles for the player
    const visibleSet = new Set();
    const playerCiv = gameState.civilizations[playerCivId !== undefined ? playerCivId : 0];
    if (playerCiv) {
      // Units give vision range 2
      if (playerCiv.units) {
        for (const u of playerCiv.units) {
          const vis = HexMap.getVisibleTiles(u.x, u.y, 2, mapW, mapH);
          for (const v of vis) visibleSet.add(v.row * mapW + v.col);
        }
      }
      // Cities give vision range 2
      if (playerCiv.cities) {
        for (const city of playerCiv.cities) {
          const vis = HexMap.getVisibleTiles(city.x, city.y, 2, mapW, mapH);
          for (const v of vis) visibleSet.add(v.row * mapW + v.col);
        }
      }
    }

    // ── Render tiles ──
    for (let r = 0; r < mapH; r++) {
      for (let c = 0; c < mapW; c++) {
        const idx = r * mapW + c;
        const tile = tiles[idx];
        if (!tile) continue;

        const px = HexMap.hexToPixel(c, r, size);
        const explored = tile.explored && tile.explored[playerCivId !== undefined ? playerCivId : 0];
        const visible = visibleSet.has(idx);

        // Draw terrain hex
        _drawHexPath(ctx, px.x, px.y, size);
        if (!explored && !visible) {
          // Unexplored: black
          ctx.fillStyle = COLORS.fogBlack;
          ctx.fill();
        } else {
          // Terrain fill (sprite or flat color fallback)
          ctx.save();
          _drawHexPath(ctx, px.x, px.y, size);
          ctx.clip();
          const terrainSprite = window.Assets && window.Assets.getTerrainSprite(tile.terrain);
          if (terrainSprite) {
            const drawSize = size * 2.2;
            ctx.drawImage(terrainSprite, px.x - drawSize / 2, px.y - drawSize / 2, drawSize, drawSize);
          } else {
            ctx.fillStyle = _getTerrainColor(tile.terrain);
            ctx.fillRect(px.x - size, px.y - size, size * 2, size * 2);
          }
          ctx.restore();

          // Grid lines
          _drawHexPath(ctx, px.x, px.y, size);
          ctx.strokeStyle = COLORS.gridLine;
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Resource icon (small, bottom-right)
          if (tile.resource) {
            const resSprite = window.Assets && window.Assets.getResourceSprite(tile.resource);
            if (resSprite) {
              const resSize = size * 0.45;
              ctx.drawImage(resSprite, px.x + size * 0.15, px.y + size * 0.15, resSize, resSize);
            } else if (RESOURCE_ICONS[tile.resource]) {
              ctx.font = `${size * 0.4}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(RESOURCE_ICONS[tile.resource], px.x + size * 0.3, px.y + size * 0.35);
            }
          }

          // Fog overlay if explored but not currently visible
          if (explored && !visible) {
            _drawHexPath(ctx, px.x, px.y, size);
            ctx.fillStyle = COLORS.fogGray;
            ctx.fill();
          }
        }
      }
    }

    // ── Selected unit highlight + movement range ──
    const selected = gameState.selectedUnit;
    if (selected) {
      // Movement range
      if (selected.movementRange) {
        for (const cell of selected.movementRange) {
          const px = HexMap.hexToPixel(cell.col, cell.row, size);
          _drawHexPath(ctx, px.x, px.y, size);
          ctx.fillStyle = COLORS.moveRange;
          ctx.fill();
          ctx.strokeStyle = COLORS.moveRangeBorder;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      // Path preview
      if (selected.pathPreview && selected.pathPreview.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        const p0 = HexMap.hexToPixel(selected.pathPreview[0].col, selected.pathPreview[0].row, size);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < selected.pathPreview.length; i++) {
          const p = HexMap.hexToPixel(selected.pathPreview[i].col, selected.pathPreview[i].row, size);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Highlight selected tile
      const sp = HexMap.hexToPixel(selected.x, selected.y, size);
      _drawHexPath(ctx, sp.x, sp.y, size);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // ── Render cities ──
    for (const civ of gameState.civilizations) {
      if (!civ.cities) continue;
      const civColor = CIV_COLORS[civ.id] || '#888';
      for (const city of civ.cities) {
        const px = HexMap.hexToPixel(city.x, city.y, size);
        const idx = city.y * mapW + city.x;
        if (!visibleSet.has(idx)) {
          // Only show if explored
          const tile = tiles[idx];
          if (!tile || !tile.explored || !tile.explored[playerCivId !== undefined ? playerCivId : 0]) continue;
        }

        // City sprite or circle fallback
        const citySprite = window.Assets && window.Assets.getCitySprite(civ.id, city.population);
        if (citySprite) {
          const cityDrawSize = size * 1.3;
          ctx.drawImage(citySprite, px.x - cityDrawSize / 2, px.y - cityDrawSize / 2, cityDrawSize, cityDrawSize);
        } else {
          // Fallback: colored circle + population number
          ctx.beginPath();
          ctx.arc(px.x, px.y, size * 0.55, 0, Math.PI * 2);
          ctx.fillStyle = civColor;
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#fff';
          ctx.font = `bold ${size * 0.55}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(city.population || 1), px.x, px.y);
        }

        // City name above
        ctx.fillStyle = COLORS.text;
        ctx.font = `${size * 0.4}px sans-serif`;
        ctx.fillText(city.name || '', px.x, px.y - size * 0.8);

        // HP bar if damaged
        if (city.hp !== undefined && city.hp < 100) {
          const barW = size * 1.0;
          const barH = 3;
          const barX = px.x - barW / 2;
          const barY = px.y + size * 0.65;
          ctx.fillStyle = '#333';
          ctx.fillRect(barX, barY, barW, barH);
          const ratio = Math.max(0, city.hp / 100);
          ctx.fillStyle = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';
          ctx.fillRect(barX, barY, barW * ratio, barH);
        }
      }
    }

    // ── Render units ──
    for (const civ of gameState.civilizations) {
      if (!civ.units) continue;
      const civColor = CIV_COLORS[civ.id] || '#888';
      for (const unit of civ.units) {
        const idx = unit.y * mapW + unit.x;
        if (!visibleSet.has(idx)) {
          // Don't render enemy units outside vision
          if (civ.id !== (playerCivId !== undefined ? playerCivId : 0)) continue;
        }

        // Check if this unit has an active move animation
        const anim = _animations.find(a => a.type === 'move' && a.unit === unit);
        let drawX, drawY;
        if (anim) {
          drawX = anim.currentX;
          drawY = anim.currentY;
        } else {
          const px = HexMap.hexToPixel(unit.x, unit.y, size);
          drawX = px.x;
          drawY = px.y;
        }

        // Combat shake
        const combatAnim = _animations.find(a => a.type === 'combat' && (a.unit === unit));
        if (combatAnim) {
          drawX += combatAnim.shakeX;
          drawY += combatAnim.shakeY;
        }

        // Unit sprite or circle+emoji fallback
        const unitSprite = window.Assets && window.Assets.getUnitSprite(unit.type, civ.id);
        if (unitSprite) {
          const unitDrawSize = size * 0.9;
          ctx.drawImage(unitSprite, drawX - unitDrawSize / 2, drawY - unitDrawSize / 2, unitDrawSize, unitDrawSize);
        } else {
          // Fallback: colored circle + emoji icon
          ctx.beginPath();
          ctx.arc(drawX, drawY, size * 0.38, 0, Math.PI * 2);
          ctx.fillStyle = civColor;
          ctx.fill();
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.stroke();

          const icon = UNIT_ICONS[unit.type] || '\u2694';
          ctx.fillStyle = '#fff';
          ctx.font = `${size * 0.42}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(icon, drawX, drawY);
        }

        // HP bar under unit
        if (unit.hp !== undefined && unit.hp < (unit.maxHp || 20)) {
          const barW = size * 0.7;
          const barH = 2.5;
          const barX = drawX - barW / 2;
          const barY = drawY + size * 0.45;
          ctx.fillStyle = '#333';
          ctx.fillRect(barX, barY, barW, barH);
          const ratio = Math.max(0, unit.hp / (unit.maxHp || 20));
          ctx.fillStyle = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';
          ctx.fillRect(barX, barY, barW * ratio, barH);
        }
      }
    }

    ctx.restore();
  }

  // ─── Minimap ──────────────────────────────────────────────────

  function drawMinimap(gameState, playerCivId) {
    if (!_minimapCanvas || !_minimapCtx) return;
    const ctx = _minimapCtx;
    const W = _minimapCanvas.width;
    const H = _minimapCanvas.height;
    const mapW = gameState.mapWidth || 20;
    const mapH = gameState.mapHeight || 15;
    const tiles = gameState.tiles;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, W, H);

    const tileW = W / mapW;
    const tileH = H / mapH;

    // Tiles
    for (let r = 0; r < mapH; r++) {
      for (let c = 0; c < mapW; c++) {
        const idx = r * mapW + c;
        const tile = tiles[idx];
        if (!tile) continue;

        const explored = tile.explored && tile.explored[playerCivId !== undefined ? playerCivId : 0];
        const x = c * tileW + (r & 1 ? tileW * 0.5 : 0);
        const y = r * tileH;

        if (!explored) {
          ctx.fillStyle = '#111';
        } else {
          ctx.fillStyle = _getTerrainColor(tile.terrain);
        }
        ctx.fillRect(x, y, tileW + 0.5, tileH + 0.5);
      }
    }

    // Cities as dots
    for (const civ of gameState.civilizations) {
      if (!civ.cities) continue;
      const civColor = CIV_COLORS[civ.id] || '#888';
      for (const city of civ.cities) {
        const x = city.x * tileW + (city.y & 1 ? tileW * 0.5 : 0) + tileW / 2;
        const y = city.y * tileH + tileH / 2;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2, tileW * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = civColor;
        ctx.fill();
      }
    }

    // Units as small dots
    for (const civ of gameState.civilizations) {
      if (!civ.units) continue;
      const civColor = CIV_COLORS[civ.id] || '#888';
      for (const unit of civ.units) {
        const x = unit.x * tileW + (unit.y & 1 ? tileW * 0.5 : 0) + tileW / 2;
        const y = unit.y * tileH + tileH / 2;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, tileW * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = civColor;
        ctx.fill();
      }
    }

    // Camera viewport rectangle
    if (_canvas) {
      const size = camera.hexSize;
      const world = screenToWorld(0, 0);
      const worldEnd = screenToWorld(_canvas.width, _canvas.height);

      // World coords to minimap coords (approximate)
      // The full map in world coords
      const mapPixelW = HexMap.hexToPixel(mapW - 1, 0, size).x + size;
      const mapPixelH = HexMap.hexToPixel(0, mapH - 1, size).y + size;

      const vx = (world.x / mapPixelW) * W;
      const vy = (world.y / mapPixelH) * H;
      const vw = ((worldEnd.x - world.x) / mapPixelW) * W;
      const vh = ((worldEnd.y - world.y) / mapPixelH) * H;

      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx, vy, vw, vh);
    }
  }

  // ─── Animations ───────────────────────────────────────────────

  /**
   * Smoothly move a unit along a path.
   * path: [{col, row}, ...]
   * callback: called when animation finishes
   */
  function animateMove(unit, path, callback) {
    if (!path || path.length < 2) {
      if (callback) callback();
      return;
    }

    const size = camera.hexSize;
    const startTime = performance.now();
    const stepDuration = 200; // ms per hex
    const totalDuration = (path.length - 1) * stepDuration;

    const worldPoints = path.map(p => HexMap.hexToPixel(p.col, p.row, size));

    const anim = {
      type: 'move',
      unit,
      startTime,
      totalDuration,
      currentX: worldPoints[0].x,
      currentY: worldPoints[0].y,
      update(now) {
        const elapsed = now - startTime;
        if (elapsed >= totalDuration) {
          this.currentX = worldPoints[worldPoints.length - 1].x;
          this.currentY = worldPoints[worldPoints.length - 1].y;
          return true; // done
        }
        const progress = elapsed / stepDuration;
        const segIdx = Math.floor(progress);
        const segT = progress - segIdx;
        const from = worldPoints[segIdx];
        const to = worldPoints[Math.min(segIdx + 1, worldPoints.length - 1)];
        // Smooth step
        const t = segT * segT * (3 - 2 * segT);
        this.currentX = from.x + (to.x - from.x) * t;
        this.currentY = from.y + (to.y - from.y) * t;
        return false;
      },
      onDone: callback,
    };

    _animations.push(anim);
  }

  /**
   * Shake effect for combat.
   * callback: called when animation finishes
   */
  function animateCombat(attacker, defender, callback) {
    const startTime = performance.now();
    const duration = 400; // ms

    const animA = {
      type: 'combat',
      unit: attacker,
      shakeX: 0,
      shakeY: 0,
      startTime,
      duration,
      update(now) {
        const elapsed = now - startTime;
        if (elapsed >= duration) {
          this.shakeX = 0;
          this.shakeY = 0;
          return true;
        }
        const intensity = 4 * (1 - elapsed / duration);
        this.shakeX = (Math.random() - 0.5) * intensity * 2;
        this.shakeY = (Math.random() - 0.5) * intensity * 2;
        return false;
      },
      onDone: null,
    };

    const animD = {
      type: 'combat',
      unit: defender,
      shakeX: 0,
      shakeY: 0,
      startTime,
      duration,
      update(now) {
        const elapsed = now - startTime;
        if (elapsed >= duration) {
          this.shakeX = 0;
          this.shakeY = 0;
          return true;
        }
        const intensity = 6 * (1 - elapsed / duration);
        this.shakeX = (Math.random() - 0.5) * intensity * 2;
        this.shakeY = (Math.random() - 0.5) * intensity * 2;
        return false;
      },
      onDone: callback,
    };

    _animations.push(animA);
    _animations.push(animD);
  }

  /**
   * Tick all active animations. Call this each frame before draw().
   * Returns true if any animations are active (need redraw).
   */
  function updateAnimations() {
    if (_animations.length === 0) return false;
    const now = performance.now();
    for (let i = _animations.length - 1; i >= 0; i--) {
      const anim = _animations[i];
      const done = anim.update(now);
      if (done) {
        _animations.splice(i, 1);
        if (anim.onDone) anim.onDone();
      }
    }
    return _animations.length > 0;
  }

  /**
   * Whether any animation is currently playing.
   */
  function isAnimating() {
    return _animations.length > 0;
  }

  // ─── Public API ───────────────────────────────────────────────

  window.Renderer = {
    init,
    draw,
    drawMinimap,
    camera,
    screenToWorld,
    worldToScreen,
    animateMove,
    animateCombat,
    updateAnimations,
    isAnimating,
    COLORS,
    CIV_COLORS,
    UNIT_ICONS,
    RESOURCE_ICONS,
  };
})();
