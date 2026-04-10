/**
 * map.js — HexMap namespace
 * Hex grid generation, coordinate math, pathfinding, and map utilities.
 * Namespace: window.HexMap
 * No external dependencies.
 */
(function () {
  'use strict';

  // ─── Terrain definitions ───────────────────────────────────────
  const TERRAINS = {
    water:   { food: 0, production: 0, gold: 1, moveCost: Infinity, color: '#277DA1' },
    plains:  { food: 2, production: 1, gold: 0, moveCost: 1, color: '#90BE6D' },
    grass:   { food: 3, production: 0, gold: 0, moveCost: 1, color: '#43AA8B' },
    forest:  { food: 1, production: 2, gold: 0, moveCost: 2, color: '#2D6A4F' },
    hills:   { food: 1, production: 2, gold: 0, moveCost: 2, color: '#B5838D' },
    mountain:{ food: 0, production: 3, gold: 1, moveCost: 3, color: '#6C757D' },
    desert:  { food: 0, production: 1, gold: 2, moveCost: 1, color: '#F4D35E' },
  };

  // ─── Simplex-like 2D noise (gradient noise, no external lib) ──
  // Uses a permutation table + gradient dot product approach.

  const GRAD2 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];

  let _perm = null;
  let _seed = 0;

  function _buildPerm(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates with seeded RNG
    let s = seed | 0;
    function rng() {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 4294967296;
    }
    for (let i = 255; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    // Double the table for wrapping
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    return perm;
  }

  function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function _lerp(a, b, t) { return a + t * (b - a); }

  function _grad2d(hash, x, y) {
    const g = GRAD2[hash & 7];
    return g[0] * x + g[1] * y;
  }

  /**
   * 2D Perlin-style noise, returns value in roughly [-1, 1].
   */
  function noise2d(x, y) {
    const perm = _perm;
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = _fade(xf);
    const v = _fade(yf);

    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];

    return _lerp(
      _lerp(_grad2d(aa, xf, yf), _grad2d(ba, xf - 1, yf), u),
      _lerp(_grad2d(ab, xf, yf - 1), _grad2d(bb, xf - 1, yf - 1), u),
      v
    );
  }

  /**
   * Multi-octave fractal noise, normalized to [0, 1].
   */
  function fractalNoise(x, y, octaves, lacunarity, persistence) {
    let val = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      val += noise2d(x * freq, y * freq) * amp;
      max += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return (val / max + 1) * 0.5; // map to 0-1
  }

  // ─── Hex math (pointy-top, offset coordinates, odd-row offset) ─

  const SQRT3 = Math.sqrt(3);

  /**
   * Convert offset hex (col, row) to pixel center.
   * Pointy-top, odd-row right offset.
   */
  function hexToPixel(col, row, size) {
    const x = size * SQRT3 * (col + 0.5 * (row & 1));
    const y = size * 1.5 * row;
    return { x, y };
  }

  /**
   * Convert pixel position to hex offset coords.
   * Uses cube coordinate rounding for accuracy.
   */
  function pixelToHex(px, py, size) {
    // Convert pixel to fractional axial
    const q = (px * SQRT3 / 3 - py / 3) / size;
    const r = (2 / 3 * py) / size;

    // Axial to cube
    const cx = q;
    const cz = r;
    const cy = -cx - cz;

    // Round cube coords
    let rx = Math.round(cx);
    let ry = Math.round(cy);
    let rz = Math.round(cz);

    const dx = Math.abs(rx - cx);
    const dy = Math.abs(ry - cy);
    const dz = Math.abs(rz - cz);

    if (dx > dy && dx > dz) {
      rx = -ry - rz;
    } else if (dy > dz) {
      ry = -rx - rz;
    } else {
      rz = -rx - ry;
    }

    // Axial (q=rx, r=rz) to offset
    const col = rx + (rz - (rz & 1)) / 2;
    const row = rz;
    return { col, row };
  }

  /**
   * Get 6 neighbor coords for offset hex (odd-row right offset).
   */
  function getNeighbors(col, row) {
    const parity = row & 1;
    const dirs = parity
      ? [[+1, 0], [0, -1], [-1, -1], [-1, 0], [-1, +1], [0, +1]]  // odd row
      : [[+1, 0], [+1, -1], [0, -1], [-1, 0], [0, +1], [+1, +1]]; // even row
    return dirs.map(d => ({ col: col + d[0], row: row + d[1] }));
  }

  /**
   * Hex distance using cube coordinates.
   */
  function distance(x1, y1, x2, y2) {
    // Convert offset to cube
    function toCube(col, row) {
      const x = col - (row - (row & 1)) / 2;
      const z = row;
      const y = -x - z;
      return { x, y, z };
    }
    const a = toCube(x1, y1);
    const b = toCube(x2, y2);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
  }

  // ─── A* Pathfinding ───────────────────────────────────────────

  /**
   * A* pathfinding on hex grid.
   * Returns array of {col, row} from start to end (inclusive), or null if no path.
   * tiles is flat array indexed [row * width + col].
   */
  function findPath(startX, startY, endX, endY, tiles, width, height) {
    if (!width) width = 20;
    if (!height) height = 15;

    const key = (c, r) => r * width + c;
    const inBounds = (c, r) => c >= 0 && c < width && r >= 0 && r < height;

    const endTile = tiles[key(endX, endY)];
    if (!endTile || endTile.terrain === 'water') return null;

    const open = []; // min-heap by f
    const gScore = {};
    const cameFrom = {};
    const startKey = key(startX, startY);
    const endKey = key(endX, endY);

    gScore[startKey] = 0;

    // Simple binary heap
    function heapPush(item) {
      open.push(item);
      let i = open.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (open[parent].f <= open[i].f) break;
        [open[parent], open[i]] = [open[i], open[parent]];
        i = parent;
      }
    }
    function heapPop() {
      const top = open[0];
      const last = open.pop();
      if (open.length > 0) {
        open[0] = last;
        let i = 0;
        while (true) {
          let smallest = i;
          const l = 2 * i + 1, r = 2 * i + 2;
          if (l < open.length && open[l].f < open[smallest].f) smallest = l;
          if (r < open.length && open[r].f < open[smallest].f) smallest = r;
          if (smallest === i) break;
          [open[smallest], open[i]] = [open[i], open[smallest]];
          i = smallest;
        }
      }
      return top;
    }

    heapPush({ col: startX, row: startY, f: distance(startX, startY, endX, endY) });

    const closed = new Set();

    while (open.length > 0) {
      const cur = heapPop();
      const ck = key(cur.col, cur.row);

      if (ck === endKey) {
        // Reconstruct
        const path = [{ col: endX, row: endY }];
        let k = endKey;
        while (cameFrom[k] !== undefined) {
          const prev = cameFrom[k];
          path.push({ col: prev % width === prev - Math.floor(prev / width) * width ? prev % width : prev % width, row: Math.floor(prev / width) });
          // Simpler:
          path[path.length - 1] = { col: prev % width, row: Math.floor(prev / width) };
          k = prev;
        }
        path.reverse();
        return path;
      }

      if (closed.has(ck)) continue;
      closed.add(ck);

      const neighbors = getNeighbors(cur.col, cur.row);
      for (const nb of neighbors) {
        if (!inBounds(nb.col, nb.row)) continue;
        const nk = key(nb.col, nb.row);
        if (closed.has(nk)) continue;

        const tile = tiles[nk];
        if (!tile || tile.terrain === 'water') continue;

        const moveCost = TERRAINS[tile.terrain].moveCost;
        const tentG = (gScore[ck] || 0) + moveCost;

        if (gScore[nk] === undefined || tentG < gScore[nk]) {
          gScore[nk] = tentG;
          cameFrom[nk] = ck;
          const f = tentG + distance(nb.col, nb.row, endX, endY);
          heapPush({ col: nb.col, row: nb.row, f });
        }
      }
    }

    return null; // no path
  }

  /**
   * Get all tiles within hex range of (x, y).
   * Returns array of {col, row}.
   */
  function getVisibleTiles(x, y, range, width, height) {
    if (!width) width = 20;
    if (!height) height = 15;
    const result = [];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (distance(x, y, c, r) <= range) {
          result.push({ col: c, row: r });
        }
      }
    }
    return result;
  }

  // ─── Map generation ───────────────────────────────────────────

  /**
   * Classify terrain from noise value based on PLAN.md thresholds.
   * <0.25 water, <0.40 plains, <0.55 grass, <0.65 forest,
   * <0.80 hills, <0.90 mountain, >=0.90 desert
   */
  function classifyTerrain(n) {
    if (n < 0.25) return 'water';
    if (n < 0.40) return 'plains';
    if (n < 0.55) return 'grass';
    if (n < 0.65) return 'forest';
    if (n < 0.80) return 'hills';
    if (n < 0.90) return 'mountain';
    return 'desert';
  }

  /**
   * Generate the hex map.
   * Returns flat array of tile objects (length = width * height).
   */
  function generate(width, height, seed) {
    if (!width) width = 20;
    if (!height) height = 15;
    if (seed === undefined) seed = (Math.random() * 2147483647) | 0;

    _seed = seed;
    _perm = _buildPerm(seed);

    const tiles = [];
    const scale = 0.12; // noise scale — controls feature size

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const n = fractalNoise(c * scale, r * scale, 4, 2.0, 0.5);

        // Push edges toward water for island-ish feel
        const edgeDist = Math.min(c, width - 1 - c, r, height - 1 - r);
        const edgeFactor = Math.min(1, edgeDist / 3);
        const adjusted = n * edgeFactor;

        const terrain = classifyTerrain(adjusted);

        tiles.push({
          x: c,
          y: r,
          terrain,
          resource: null,
          explored: {},   // civId → boolean
          improvement: null,
        });
      }
    }

    return tiles;
  }

  /**
   * Place special resources (horse, iron, gem) on valid tiles.
   * horse → grass, iron → mountain/hills, gem → desert
   * 3-5 of each per map.
   */
  function placeSpecialResources(tiles, seed) {
    // Seeded RNG
    let s = (seed !== undefined ? seed : (_seed + 7)) | 0;
    function rng() {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 4294967296;
    }

    const resourceDefs = [
      { type: 'horse', validTerrains: ['grass'] },
      { type: 'iron',  validTerrains: ['mountain', 'hills'] },
      { type: 'gem',   validTerrains: ['desert'] },
    ];

    for (const def of resourceDefs) {
      const candidates = tiles.filter(t => def.validTerrains.includes(t.terrain) && !t.resource);
      // Shuffle candidates
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      const count = Math.min(candidates.length, 3 + ((rng() * 3) | 0)); // 3-5
      for (let i = 0; i < count; i++) {
        candidates[i].resource = def.type;
      }
    }
  }

  /**
   * Find valid start positions for civilizations.
   * Requirements: not water, 8+ hex distance apart, surrounding food >= 7.
   */
  function findStartPositions(tiles, count, width, height) {
    if (!width) width = 20;
    if (!height) height = 15;
    if (!count) count = 3;

    function surroundingFood(col, row) {
      let total = 0;
      const visible = getVisibleTiles(col, row, 2, width, height);
      for (const v of visible) {
        const t = tiles[v.row * width + v.col];
        if (t) total += TERRAINS[t.terrain].food;
      }
      return total;
    }

    // Build candidate list: non-water tiles with enough food, away from edges
    const candidates = [];
    for (let r = 2; r < height - 2; r++) {
      for (let c = 2; c < width - 2; c++) {
        const t = tiles[r * width + c];
        if (t.terrain === 'water' || t.terrain === 'mountain') continue;
        const food = surroundingFood(c, r);
        if (food >= 7) {
          candidates.push({ col: c, row: r, food });
        }
      }
    }

    // Sort by food descending for best positions
    candidates.sort((a, b) => b.food - a.food);

    const positions = [];
    for (const cand of candidates) {
      if (positions.length >= count) break;
      let tooClose = false;
      for (const pos of positions) {
        if (distance(cand.col, cand.row, pos.col, pos.row) < 8) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        positions.push({ col: cand.col, row: cand.row });
      }
    }

    // Fallback: if we couldn't find enough positions with food >= 7, relax constraints
    if (positions.length < count) {
      for (let r = 2; r < height - 2; r++) {
        for (let c = 2; c < width - 2; c++) {
          if (positions.length >= count) break;
          const t = tiles[r * width + c];
          if (t.terrain === 'water' || t.terrain === 'mountain') continue;
          let tooClose = false;
          for (const pos of positions) {
            if (distance(c, r, pos.col, pos.row) < 5) {
              tooClose = true;
              break;
            }
          }
          if (!tooClose) positions.push({ col: c, row: r });
        }
      }
    }

    return positions;
  }

  /**
   * Get hex corner vertices for rendering.
   * Pointy-top hexagon.
   */
  function hexCorners(cx, cy, size) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      corners.push({
        x: cx + size * Math.cos(angle),
        y: cy + size * Math.sin(angle),
      });
    }
    return corners;
  }

  // ─── Public API ───────────────────────────────────────────────

  window.HexMap = {
    TERRAINS,
    generate,
    hexToPixel,
    pixelToHex,
    getNeighbors,
    distance,
    findPath,
    getVisibleTiles,
    placeSpecialResources,
    findStartPositions,
    hexCorners,
    // Expose noise for testing
    noise2d,
    fractalNoise,
    setSeed(seed) {
      _seed = seed;
      _perm = _buildPerm(seed);
    },
  };
})();
