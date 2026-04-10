(function() {
  'use strict';

  const SPRITE_SIZE = 64;
  const RESOURCE_SIZE = 32;
  const CIV_COLORS = ['#4361ee', '#e63946', '#2a9d8f'];

  const terrainCache = new Map();
  const unitCache = new Map();   // key: `${type}_${civIndex}`
  const cityCache = new Map();   // key: `${civIndex}`
  const resourceCache = new Map();

  // ─── Helpers ──────────────────────────────────────────

  function createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function createHexClip(ctx, cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();
  }

  function hexPath(ctx, cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // Seeded pseudo-random for consistent sprites
  function mulberry32(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ─── Terrain Sprites ─────────────────────────────────

  function drawWater() {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    const cx = SPRITE_SIZE / 2, cy = SPRITE_SIZE / 2, r = 30;

    ctx.save();
    createHexClip(ctx, cx, cy, r);

    // Deep water gradient
    const grad = ctx.createRadialGradient(cx, cy - 5, 2, cx, cy, 35);
    grad.addColorStop(0, '#3498db');
    grad.addColorStop(0.5, '#277DA1');
    grad.addColorStop(1, '#1a6b91');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    // Wave patterns — layered horizontal curves
    const rng = mulberry32(42);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    for (let row = 8; row < SPRITE_SIZE; row += 7) {
      ctx.beginPath();
      for (let x = 0; x < SPRITE_SIZE; x += 2) {
        const waveY = row + Math.sin((x + rng() * 10) * 0.15) * 3;
        if (x === 0) ctx.moveTo(x, waveY);
        else ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }

    // Darker wave troughs
    ctx.strokeStyle = 'rgba(0,30,60,0.12)';
    ctx.lineWidth = 1;
    for (let row = 12; row < SPRITE_SIZE; row += 9) {
      ctx.beginPath();
      for (let x = 0; x < SPRITE_SIZE; x += 2) {
        const waveY = row + Math.sin((x + 20) * 0.12) * 2.5;
        if (x === 0) ctx.moveTo(x, waveY);
        else ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }

    // White wave crests
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 8; i++) {
      const wx = 8 + rng() * 48;
      const wy = 8 + rng() * 48;
      ctx.beginPath();
      ctx.ellipse(wx, wy, 3 + rng() * 3, 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shimmer highlights
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 12; i++) {
      const sx = rng() * SPRITE_SIZE;
      const sy = rng() * SPRITE_SIZE;
      ctx.fillRect(sx, sy, 2, 1);
    }

    ctx.restore();

    // Hex outline
    ctx.strokeStyle = 'rgba(0,60,100,0.3)';
    ctx.lineWidth = 1;
    hexPath(ctx, cx, cy, r);
    ctx.stroke();

    return c;
  }

  function drawPlains() {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    const cx = SPRITE_SIZE / 2, cy = SPRITE_SIZE / 2, r = 30;
    const rng = mulberry32(101);

    ctx.save();
    createHexClip(ctx, cx, cy, r);

    // Base gradient
    const grad = ctx.createLinearGradient(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    grad.addColorStop(0, '#90BE6D');
    grad.addColorStop(0.5, '#86b462');
    grad.addColorStop(1, '#7daa58');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    // Subtle color patches
    ctx.fillStyle = 'rgba(160,210,120,0.25)';
    for (let i = 0; i < 6; i++) {
      const px = rng() * SPRITE_SIZE;
      const py = rng() * SPRITE_SIZE;
      ctx.beginPath();
      ctx.arc(px, py, 5 + rng() * 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Grass tufts — thin lines
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 40; i++) {
      const gx = 4 + rng() * 56;
      const gy = 10 + rng() * 50;
      const h = 3 + rng() * 5;
      const lean = (rng() - 0.5) * 3;
      const green = Math.floor(100 + rng() * 60);
      ctx.strokeStyle = `rgba(${40 + Math.floor(rng()*30)},${green},${30 + Math.floor(rng()*30)},0.6)`;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + lean * 0.5, gy - h * 0.6, gx + lean, gy - h);
      ctx.stroke();
    }

    // Small stones
    ctx.fillStyle = 'rgba(120,110,100,0.2)';
    for (let i = 0; i < 3; i++) {
      const sx = 10 + rng() * 44;
      const sy = 10 + rng() * 44;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 1.5, 1, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = 'rgba(80,130,50,0.3)';
    ctx.lineWidth = 1;
    hexPath(ctx, cx, cy, r);
    ctx.stroke();

    return c;
  }

  function drawGrass() {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    const cx = SPRITE_SIZE / 2, cy = SPRITE_SIZE / 2, r = 30;
    const rng = mulberry32(202);

    ctx.save();
    createHexClip(ctx, cx, cy, r);

    // Lush base
    const grad = ctx.createLinearGradient(0, 0, 0, SPRITE_SIZE);
    grad.addColorStop(0, '#43AA8B');
    grad.addColorStop(1, '#3a9a7c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    // Color variation patches
    ctx.fillStyle = 'rgba(80,190,140,0.3)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(rng() * 64, rng() * 64, 6 + rng() * 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dense grass blades
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 60; i++) {
      const gx = 2 + rng() * 60;
      const gy = 8 + rng() * 52;
      const h = 4 + rng() * 6;
      const lean = (rng() - 0.5) * 2.5;
      ctx.strokeStyle = `rgba(${30 + Math.floor(rng()*20)},${100 + Math.floor(rng()*80)},${50 + Math.floor(rng()*40)},0.55)`;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + lean * 0.4, gy - h * 0.5, gx + lean, gy - h);
      ctx.stroke();
    }

    // Small flowers (yellow/white dots)
    for (let i = 0; i < 8; i++) {
      const fx = 8 + rng() * 48;
      const fy = 8 + rng() * 48;
      const isYellow = rng() > 0.5;
      ctx.fillStyle = isYellow ? '#f9e547' : '#ffffff';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.2 + rng() * 0.8, 0, Math.PI * 2);
      ctx.fill();
      // Petal hints
      if (rng() > 0.5) {
        ctx.fillStyle = isYellow ? '#f5d020' : '#eee';
        for (let p = 0; p < 4; p++) {
          const pa = (Math.PI / 2) * p;
          ctx.beginPath();
          ctx.arc(fx + Math.cos(pa) * 1.5, fy + Math.sin(pa) * 1.5, 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();

    ctx.strokeStyle = 'rgba(50,140,100,0.3)';
    ctx.lineWidth = 1;
    hexPath(ctx, cx, cy, r);
    ctx.stroke();

    return c;
  }

  function drawForest() {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    const cx = SPRITE_SIZE / 2, cy = SPRITE_SIZE / 2, r = 30;
    const rng = mulberry32(303);

    ctx.save();
    createHexClip(ctx, cx, cy, r);

    // Dark green base
    ctx.fillStyle = '#2D6A4F';
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    // Forest floor texture
    ctx.fillStyle = 'rgba(25,60,40,0.4)';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(rng() * 64, rng() * 64, 4 + rng() * 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground grass
    ctx.strokeStyle = 'rgba(50,100,60,0.4)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 20; i++) {
      const gx = rng() * 64;
      const gy = 40 + rng() * 24;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + (rng() - 0.5) * 3, gy - 3 - rng() * 3);
      ctx.stroke();
    }

    // Trees (3-4 trees)
    const trees = [
      { x: 20, y: 38, s: 1.1, type: 'tri' },
      { x: 38, y: 32, s: 1.3, type: 'round' },
      { x: 50, y: 40, s: 0.9, type: 'tri' },
      { x: 30, y: 46, s: 1.0, type: 'round' },
    ];

    for (const t of trees) {
      const tx = t.x, ty = t.y, s = t.s;

      // Trunk
      ctx.fillStyle = '#5C4033';
      ctx.fillRect(tx - 1.5 * s, ty, 3 * s, 10 * s);
      // Trunk highlight
      ctx.fillStyle = 'rgba(100,70,50,0.4)';
      ctx.fillRect(tx - 0.5 * s, ty + 1, 1.5 * s, 8 * s);

      // Canopy
      const greens = ['#1B4332', '#2D6A4F', '#40916C', '#357a54'];
      const canopyColor = greens[Math.floor(rng() * greens.length)];

      if (t.type === 'tri') {
        // Triangular tree
        ctx.fillStyle = canopyColor;
        ctx.beginPath();
        ctx.moveTo(tx, ty - 14 * s);
        ctx.lineTo(tx - 8 * s, ty + 2);
        ctx.lineTo(tx + 8 * s, ty + 2);
        ctx.closePath();
        ctx.fill();

        // Lighter layer
        ctx.fillStyle = 'rgba(80,160,100,0.3)';
        ctx.beginPath();
        ctx.moveTo(tx, ty - 10 * s);
        ctx.lineTo(tx - 5 * s, ty);
        ctx.lineTo(tx + 5 * s, ty);
        ctx.closePath();
        ctx.fill();
      } else {
        // Round tree
        ctx.fillStyle = canopyColor;
        ctx.beginPath();
        ctx.arc(tx, ty - 6 * s, 9 * s, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(80,180,100,0.25)';
        ctx.beginPath();
        ctx.arc(tx - 2 * s, ty - 8 * s, 5 * s, 0, Math.PI * 2);
        ctx.fill();
      }

      // Shadow at base
      ctx.fillStyle = 'rgba(0,30,15,0.2)';
      ctx.beginPath();
      ctx.ellipse(tx, ty + 10 * s, 6 * s, 2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = 'rgba(30,80,50,0.35)';
    ctx.lineWidth = 1;
    hexPath(ctx, cx, cy, r);
    ctx.stroke();

    return c;
  }

  function drawHills() {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    const cx = SPRITE_SIZE / 2, cy = SPRITE_SIZE / 2, r = 30;
    const rng = mulberry32(404);

    ctx.save();
    createHexClip(ctx, cx, cy, r);

    // Base
    const grad = ctx.createLinearGradient(0, 0, 0, SPRITE_SIZE);
    grad.addColorStop(0, '#c49aaa');
    grad.addColorStop(1, '#B5838D');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    // Rolling hill silhouettes (layered back to front)
    const hills = [
      { baseY: 28, color: 'rgba(140,100,110,0.5)', amplitude: 10, offset: 0 },
      { baseY: 35, color: 'rgba(160,115,125,0.6)', amplitude: 12, offset: 15 },
      { baseY: 42, color: 'rgba(181,131,141,0.7)', amplitude: 8, offset: 8 },
    ];

    for (const hill of hills) {
      ctx.fillStyle = hill.color;
      ctx.beginPath();
      ctx.moveTo(0, SPRITE_SIZE);
      for (let x = 0; x <= SPRITE_SIZE; x += 2) {
        const y = hill.baseY - Math.sin((x + hill.offset) * 0.08) * hill.amplitude
                  - Math.sin((x + hill.offset * 2) * 0.15) * (hill.amplitude * 0.4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(SPRITE_SIZE, SPRITE_SIZE);
      ctx.closePath();
      ctx.fill();
    }

    // Hill top highlights
    ctx.strokeStyle = 'rgba(220,190,200,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= SPRITE_SIZE; x += 2) {
      const y = 32 - Math.sin((x + 15) * 0.08) * 12 - Math.sin((x + 30) * 0.15) * 5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Grass tufts on hills
    ctx.strokeStyle = 'rgba(100,140,80,0.4)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 15; i++) {
      const gx = 5 + rng() * 54;
      const gy = 30 + rng() * 25;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + (rng() - 0.5) * 2, gy - 3 - rng() * 2);
      ctx.stroke();
    }

    // Small rocks
    ctx.fillStyle = 'rgba(100,80,85,0.3)';
    for (let i = 0; i < 5; i++) {
      const rx = 8 + rng() * 48;
      const ry = 35 + rng() * 20;
      ctx.beginPath();
      ctx.ellipse(rx, ry, 1.5 + rng(), 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = 'rgba(130,95,105,0.3)';
    ctx.lineWidth = 1;
    hexPath(ctx, cx, cy, r);
    ctx.stroke();

    return c;
  }

  function drawMountain() {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    const cx = SPRITE_SIZE / 2, cy = SPRITE_SIZE / 2, r = 30;
    const rng = mulberry32(505);

    ctx.save();
    createHexClip(ctx, cx, cy, r);

    // Sky-ish background
    const grad = ctx.createLinearGradient(0, 0, 0, SPRITE_SIZE);
    grad.addColorStop(0, '#8d99ae');
    grad.addColorStop(1, '#6C757D');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    // Ground at base
    ctx.fillStyle = '#5a6268';
    ctx.fillRect(0, 45, SPRITE_SIZE, 20);

    // Mountain peaks (3 peaks, back to front)
    // Back peak (left)
    ctx.fillStyle = '#555e66';
    ctx.beginPath();
    ctx.moveTo(5, 52);
    ctx.lineTo(18, 14);
    ctx.lineTo(32, 52);
    ctx.closePath();
    ctx.fill();

    // Back peak (right)
    ctx.fillStyle = '#5a636b';
    ctx.beginPath();
    ctx.moveTo(35, 52);
    ctx.lineTo(52, 18);
    ctx.lineTo(62, 52);
    ctx.closePath();
    ctx.fill();

    // Main center peak
    const mGrad = ctx.createLinearGradient(32, 8, 32, 55);
    mGrad.addColorStop(0, '#7a838b');
    mGrad.addColorStop(1, '#4a5258');
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.moveTo(12, 55);
    ctx.lineTo(32, 8);
    ctx.lineTo(52, 55);
    ctx.closePath();
    ctx.fill();

    // Rocky texture lines
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 8; i++) {
      const sx = 18 + rng() * 28;
      const sy = 15 + rng() * 35;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (rng() - 0.5) * 8, sy + 3 + rng() * 5);
      ctx.stroke();
    }

    // Snow caps on center peak
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(27, 18);
    ctx.lineTo(32, 8);
    ctx.lineTo(37, 18);
    ctx.quadraticCurveTo(34, 16, 32, 19);
    ctx.quadraticCurveTo(30, 15, 27, 18);
    ctx.closePath();
    ctx.fill();

    // Snow on left peak
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(14, 22);
    ctx.lineTo(18, 14);
    ctx.lineTo(22, 22);
    ctx.quadraticCurveTo(18, 20, 14, 22);
    ctx.closePath();
    ctx.fill();

    // Snow on right peak
    ctx.beginPath();
    ctx.moveTo(48, 25);
    ctx.lineTo(52, 18);
    ctx.lineTo(55, 25);
    ctx.quadraticCurveTo(52, 23, 48, 25);
    ctx.closePath();
    ctx.fill();

    // Shadow on mountain face
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.moveTo(32, 8);
    ctx.lineTo(52, 55);
    ctx.lineTo(32, 55);
    ctx.closePath();
    ctx.fill();

    // Small rocks at base
    ctx.fillStyle = 'rgba(80,80,80,0.4)';
    for (let i = 0; i < 6; i++) {
      const rx = 8 + rng() * 48;
      const ry = 48 + rng() * 8;
      ctx.beginPath();
      ctx.ellipse(rx, ry, 1 + rng() * 2, 1 + rng(), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = 'rgba(60,65,70,0.35)';
    ctx.lineWidth = 1;
    hexPath(ctx, cx, cy, r);
    ctx.stroke();

    return c;
  }

  function drawDesert() {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    const cx = SPRITE_SIZE / 2, cy = SPRITE_SIZE / 2, r = 30;
    const rng = mulberry32(606);

    ctx.save();
    createHexClip(ctx, cx, cy, r);

    // Sandy base gradient
    const grad = ctx.createLinearGradient(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    grad.addColorStop(0, '#F4D35E');
    grad.addColorStop(0.5, '#edc84e');
    grad.addColorStop(1, '#e6be3f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    // Sand dune curves
    ctx.strokeStyle = 'rgba(200,160,40,0.4)';
    ctx.lineWidth = 1.5;
    for (let row = 15; row < 55; row += 10) {
      ctx.beginPath();
      for (let x = 0; x <= SPRITE_SIZE; x += 2) {
        const y = row + Math.sin(x * 0.1 + row * 0.3) * 4 + Math.sin(x * 0.2) * 2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Dune highlight (light)
    ctx.strokeStyle = 'rgba(255,240,180,0.3)';
    ctx.lineWidth = 1;
    for (let row = 12; row < 50; row += 10) {
      ctx.beginPath();
      for (let x = 0; x <= SPRITE_SIZE; x += 2) {
        const y = row + Math.sin(x * 0.1 + row * 0.3) * 4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Sand texture dots
    ctx.fillStyle = 'rgba(180,140,30,0.2)';
    for (let i = 0; i < 40; i++) {
      const dx = rng() * 64;
      const dy = rng() * 64;
      ctx.fillRect(dx, dy, 1, 1);
    }

    // Small cactus
    const cactX = 38, cactY = 34;
    // Main stem
    ctx.fillStyle = '#5a8a32';
    ctx.beginPath();
    ctx.roundRect(cactX - 2, cactY - 10, 4, 14, 2);
    ctx.fill();
    // Left arm
    ctx.beginPath();
    ctx.roundRect(cactX - 6, cactY - 6, 4, 3, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cactX - 6, cactY - 9, 2.5, 5, 1);
    ctx.fill();
    // Right arm
    ctx.beginPath();
    ctx.roundRect(cactX + 2, cactY - 8, 4, 3, 1);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cactX + 4, cactY - 11, 2.5, 5, 1);
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(120,200,80,0.3)';
    ctx.fillRect(cactX - 1, cactY - 9, 1.5, 12);

    // Shadow under cactus
    ctx.fillStyle = 'rgba(150,120,30,0.2)';
    ctx.beginPath();
    ctx.ellipse(cactX, cactY + 5, 5, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.strokeStyle = 'rgba(180,150,40,0.3)';
    ctx.lineWidth = 1;
    hexPath(ctx, cx, cy, r);
    ctx.stroke();

    return c;
  }

  // ─── Unit Sprites ─────────────────────────────────────

  function drawUnitBase(ctx, civColor) {
    // Circle background
    const cx = SPRITE_SIZE / 2, cy = SPRITE_SIZE / 2;
    const grad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 26);
    grad.addColorStop(0, lightenColor(civColor, 30));
    grad.addColorStop(1, civColor);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.stroke();

    // Inner highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.stroke();
  }

  function lightenColor(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }

  function drawWarrior(civColor) {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    drawUnitBase(ctx, civColor);

    const cx = 32, cy = 32;

    // Shield (gray circle)
    ctx.fillStyle = '#a0a0a0';
    ctx.beginPath();
    ctx.arc(cx - 3, cy + 2, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#707070';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Shield boss (center bump)
    ctx.fillStyle = '#c0c0c0';
    ctx.beginPath();
    ctx.arc(cx - 3, cy + 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Shield highlight
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 1, 5, 0, Math.PI * 2);
    ctx.fill();

    // Sword
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + 5, cy + 14);
    ctx.lineTo(cx + 10, cy - 14);
    ctx.stroke();

    // Sword blade highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy + 10);
    ctx.lineTo(cx + 10, cy - 12);
    ctx.stroke();

    // Sword guard
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy + 6);
    ctx.lineTo(cx + 11, cy + 4);
    ctx.stroke();

    // Sword pommel
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.arc(cx + 5, cy + 14, 2, 0, Math.PI * 2);
    ctx.fill();

    return c;
  }

  function drawArcher(civColor) {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    drawUnitBase(ctx, civColor);

    const cx = 32, cy = 32;

    // Bow (curved arc)
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx - 4, cy, 14, -Math.PI * 0.65, Math.PI * 0.65);
    ctx.stroke();

    // Bow wood highlight
    ctx.strokeStyle = 'rgba(180,120,60,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx - 4, cy, 13, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.stroke();

    // Bowstring
    ctx.strokeStyle = '#e0dcd0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 4 + 14 * Math.cos(-Math.PI * 0.65), cy + 14 * Math.sin(-Math.PI * 0.65));
    ctx.lineTo(cx - 4 + 14 * Math.cos(Math.PI * 0.65), cy + 14 * Math.sin(Math.PI * 0.65));
    ctx.stroke();

    // Arrow shaft
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx + 16, cy);
    ctx.stroke();

    // Arrowhead
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(cx + 16, cy);
    ctx.lineTo(cx + 12, cy - 3);
    ctx.lineTo(cx + 12, cy + 3);
    ctx.closePath();
    ctx.fill();

    // Arrow fletching
    ctx.fillStyle = 'rgba(255,100,100,0.6)';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx - 3, cy - 3);
    ctx.lineTo(cx - 3, cy);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx - 3, cy + 3);
    ctx.lineTo(cx - 3, cy);
    ctx.closePath();
    ctx.fill();

    return c;
  }

  function drawKnight(civColor) {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    drawUnitBase(ctx, civColor);

    const cx = 32, cy = 32;

    // Horse body
    ctx.fillStyle = '#e8dcc8';
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy + 5, 14, 8, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Horse body shading
    ctx.fillStyle = 'rgba(180,160,140,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy + 8, 12, 5, 0, 0, Math.PI);
    ctx.fill();

    // Horse neck
    ctx.fillStyle = '#e8dcc8';
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy + 1);
    ctx.quadraticCurveTo(cx + 14, cy - 6, cx + 12, cy - 12);
    ctx.lineTo(cx + 8, cy - 10);
    ctx.quadraticCurveTo(cx + 10, cy - 4, cx + 5, cy + 1);
    ctx.closePath();
    ctx.fill();

    // Horse head
    ctx.fillStyle = '#ddd0bc';
    ctx.beginPath();
    ctx.ellipse(cx + 13, cy - 12, 5, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Horse ear
    ctx.fillStyle = '#d0c0a8';
    ctx.beginPath();
    ctx.moveTo(cx + 12, cy - 16);
    ctx.lineTo(cx + 14, cy - 20);
    ctx.lineTo(cx + 15, cy - 15);
    ctx.closePath();
    ctx.fill();

    // Horse eye
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(cx + 15, cy - 12, 1, 0, Math.PI * 2);
    ctx.fill();

    // Horse legs
    ctx.strokeStyle = '#d0c0a8';
    ctx.lineWidth = 2;
    const legs = [[-8, 12], [-3, 13], [4, 13], [9, 12]];
    for (const [lx, ly] of legs) {
      ctx.beginPath();
      ctx.moveTo(cx + lx, cy + ly - 5);
      ctx.lineTo(cx + lx, cy + ly + 2);
      ctx.stroke();
    }

    // Rider body (white)
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 4, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rider head
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.arc(cx, cy - 13, 4, 0, Math.PI * 2);
    ctx.fill();

    // Lance
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy - 8);
    ctx.lineTo(cx + 16, cy - 20);
    ctx.stroke();

    // Lance tip
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx + 16, cy - 20);
    ctx.lineTo(cx + 14, cy - 18);
    ctx.lineTo(cx + 17, cy - 18);
    ctx.closePath();
    ctx.fill();

    return c;
  }

  function drawSiege(civColor) {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    drawUnitBase(ctx, civColor);

    const cx = 32, cy = 34;

    // Cannon barrel
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.roundRect(cx - 14, cy - 5, 22, 7, 2);
    ctx.fill();

    // Barrel highlight
    ctx.fillStyle = 'rgba(200,200,200,0.2)';
    ctx.fillRect(cx - 12, cy - 4, 18, 2);

    // Barrel mouth
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(cx + 8, cy - 1.5, 3.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(cx + 8, cy - 1.5, 2, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cannon body/rear
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.roundRect(cx - 15, cy - 7, 10, 11, 3);
    ctx.fill();

    // Bolts on cannon
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(cx - 12, cy - 3, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 9, cy - 3, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Wheels
    ctx.fillStyle = '#5C4033';
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 1;
    // Left wheel
    ctx.beginPath();
    ctx.arc(cx - 10, cy + 9, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Right wheel
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 9, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wheel spokes
    ctx.strokeStyle = '#8B7355';
    ctx.lineWidth = 0.8;
    for (const wheelX of [cx - 10, cx + 2]) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
        ctx.beginPath();
        ctx.moveTo(wheelX, cy + 9);
        ctx.lineTo(wheelX + Math.cos(a) * 4, cy + 9 + Math.sin(a) * 4);
        ctx.stroke();
      }
    }

    // Wheel hubs
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(cx - 10, cy + 9, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 9, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Fuse
    ctx.strokeStyle = '#e0d0b0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy - 7);
    ctx.quadraticCurveTo(cx - 18, cy - 12, cx - 15, cy - 14);
    ctx.stroke();
    // Spark
    ctx.fillStyle = '#ff6600';
    ctx.beginPath();
    ctx.arc(cx - 15, cy - 14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(cx - 15, cy - 14, 1, 0, Math.PI * 2);
    ctx.fill();

    return c;
  }

  function drawMusket(civColor) {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    drawUnitBase(ctx, civColor);

    const cx = 32, cy = 32;

    // Body (torso)
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(cx - 5, cy - 6, 10, 14, 3);
    ctx.fill();

    // Head
    ctx.fillStyle = '#e8d8c8';
    ctx.beginPath();
    ctx.arc(cx, cy - 11, 5, 0, Math.PI * 2);
    ctx.fill();

    // Hat
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 13);
    ctx.lineTo(cx, cy - 20);
    ctx.lineTo(cx + 6, cy - 13);
    ctx.closePath();
    ctx.fill();

    // Legs
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy + 8);
    ctx.lineTo(cx - 4, cy + 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy + 8);
    ctx.lineTo(cx + 4, cy + 16);
    ctx.stroke();

    // Rifle
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy + 6);
    ctx.lineTo(cx + 10, cy - 18);
    ctx.stroke();

    // Rifle barrel (metal)
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 10, cy - 18);
    ctx.lineTo(cx + 11, cy - 22);
    ctx.stroke();

    // Bayonet
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 11, cy - 22);
    ctx.lineTo(cx + 11.5, cy - 25);
    ctx.stroke();

    // Arm holding rifle
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - 2);
    ctx.lineTo(cx + 7, cy + 2);
    ctx.stroke();

    return c;
  }

  function drawSettler(civColor) {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    drawUnitBase(ctx, civColor);

    const cx = 32, cy = 34;

    // Wagon body
    ctx.fillStyle = '#8B6914';
    ctx.beginPath();
    ctx.roundRect(cx - 14, cy - 2, 24, 10, 2);
    ctx.fill();

    // Wagon body wood grain
    ctx.strokeStyle = 'rgba(100,70,20,0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy + i * 2.5);
      ctx.lineTo(cx + 8, cy + i * 2.5);
      ctx.stroke();
    }

    // Canvas top (white cover)
    ctx.fillStyle = '#f0ebe0';
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 2);
    ctx.quadraticCurveTo(cx - 4, cy - 18, cx, cy - 16);
    ctx.quadraticCurveTo(cx + 5, cy - 18, cx + 8, cy - 2);
    ctx.closePath();
    ctx.fill();

    // Canvas folds/shadows
    ctx.strokeStyle = 'rgba(150,140,120,0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 4);
    ctx.quadraticCurveTo(cx - 2, cy - 14, cx + 2, cy - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy - 4);
    ctx.quadraticCurveTo(cx + 4, cy - 12, cx + 6, cy - 4);
    ctx.stroke();

    // Canvas outline
    ctx.strokeStyle = 'rgba(100,90,70,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 2);
    ctx.quadraticCurveTo(cx - 4, cy - 18, cx, cy - 16);
    ctx.quadraticCurveTo(cx + 5, cy - 18, cx + 8, cy - 2);
    ctx.stroke();

    // Wheels
    ctx.fillStyle = '#5C4033';
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx - 9, cy + 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 5, cy + 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wheel spokes
    ctx.strokeStyle = '#8B7355';
    ctx.lineWidth = 0.7;
    for (const wheelX of [cx - 9, cx + 5]) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
        ctx.beginPath();
        ctx.moveTo(wheelX, cy + 12);
        ctx.lineTo(wheelX + Math.cos(a) * 4, cy + 12 + Math.sin(a) * 4);
        ctx.stroke();
      }
      // Hub
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.arc(wheelX, cy + 12, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    return c;
  }

  // ─── City Sprite ──────────────────────────────────────

  function drawCity(civColor) {
    const c = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
    const ctx = c.getContext('2d');
    const cx = SPRITE_SIZE / 2, cy = SPRITE_SIZE / 2;

    // Outer glow
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(cx, cy, 29, 0, Math.PI * 2);
    ctx.fill();

    // Main circle with gradient
    const grad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 26);
    grad.addColorStop(0, lightenColor(civColor, 40));
    grad.addColorStop(1, civColor);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();

    // White border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.stroke();

    // Inner border
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 27.5, 0, Math.PI * 2);
    ctx.stroke();

    // City skyline silhouettes inside the circle
    const buildings = [
      { x: -14, w: 6, h: 16 },
      { x: -8, w: 5, h: 22 },
      { x: -3, w: 7, h: 18 },
      { x: 4, w: 5, h: 24 },
      { x: 9, w: 6, h: 14 },
      { x: 15, w: 4, h: 10 },
    ];

    // Building shadows
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (const b of buildings) {
      ctx.fillRect(cx + b.x + 1, cy + 10 - b.h + 1, b.w, b.h);
    }

    // Buildings
    for (const b of buildings) {
      const bGrad = ctx.createLinearGradient(cx + b.x, cy + 10 - b.h, cx + b.x + b.w, cy + 10);
      bGrad.addColorStop(0, 'rgba(255,255,255,0.85)');
      bGrad.addColorStop(1, 'rgba(220,220,220,0.75)');
      ctx.fillStyle = bGrad;
      ctx.fillRect(cx + b.x, cy + 10 - b.h, b.w, b.h);

      // Building outline
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx + b.x, cy + 10 - b.h, b.w, b.h);

      // Windows (small dots)
      ctx.fillStyle = 'rgba(255,255,100,0.6)';
      for (let wy = cy + 10 - b.h + 3; wy < cy + 8; wy += 4) {
        for (let wx = cx + b.x + 1.5; wx < cx + b.x + b.w - 1; wx += 2.5) {
          ctx.fillRect(wx, wy, 1.2, 1.5);
        }
      }
    }

    // Roof details on tallest building
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy + 10 - 24);
    ctx.lineTo(cx + 6.5, cy + 10 - 28);
    ctx.lineTo(cx + 9, cy + 10 - 24);
    ctx.closePath();
    ctx.fill();

    return c;
  }

  // ─── Resource Sprites ─────────────────────────────────

  function drawHorseResource() {
    const c = createCanvas(RESOURCE_SIZE, RESOURCE_SIZE);
    const ctx = c.getContext('2d');
    const cx = 16, cy = 16;

    // Background circle
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Horse silhouette
    ctx.fillStyle = '#6B4226';

    // Body
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy + 2, 8, 5, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Neck
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy);
    ctx.quadraticCurveTo(cx + 7, cy - 5, cx + 6, cy - 9);
    ctx.lineTo(cx + 3, cy - 7);
    ctx.quadraticCurveTo(cx + 4, cy - 3, cx + 2, cy);
    ctx.closePath();
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.ellipse(cx + 7, cy - 9, 3.5, 2.5, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Ear
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy - 11);
    ctx.lineTo(cx + 7, cy - 14);
    ctx.lineTo(cx + 8, cy - 11);
    ctx.closePath();
    ctx.fill();

    // Legs
    ctx.strokeStyle = '#6B4226';
    ctx.lineWidth = 1.5;
    const horselegs = [[-6, 6], [-2, 7], [2, 7], [5, 6]];
    for (const [lx, ly] of horselegs) {
      ctx.beginPath();
      ctx.moveTo(cx + lx, cy + ly - 2);
      ctx.lineTo(cx + lx + (lx < 0 ? -0.5 : 0.5), cy + ly + 3);
      ctx.stroke();
    }

    // Tail
    ctx.strokeStyle = '#4a2e18';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + 1);
    ctx.quadraticCurveTo(cx - 12, cy + 4, cx - 10, cy + 7);
    ctx.stroke();

    // Eye
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx + 8.5, cy - 9, 0.6, 0, Math.PI * 2);
    ctx.fill();

    return c;
  }

  function drawIronResource() {
    const c = createCanvas(RESOURCE_SIZE, RESOURCE_SIZE);
    const ctx = c.getContext('2d');
    const cx = 16, cy = 16;

    // Background circle
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Ingot shape (trapezoid 3D)
    // Top face
    const ingotGrad = ctx.createLinearGradient(cx - 8, cy - 4, cx + 8, cy + 2);
    ingotGrad.addColorStop(0, '#8a8a8a');
    ingotGrad.addColorStop(0.5, '#b0b0b0');
    ingotGrad.addColorStop(1, '#7a7a7a');

    // Top face
    ctx.fillStyle = ingotGrad;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 2);
    ctx.lineTo(cx - 3, cy - 6);
    ctx.lineTo(cx + 7, cy - 6);
    ctx.lineTo(cx + 8, cy - 2);
    ctx.closePath();
    ctx.fill();

    // Front face
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 2);
    ctx.lineTo(cx + 8, cy - 2);
    ctx.lineTo(cx + 8, cy + 5);
    ctx.lineTo(cx - 6, cy + 5);
    ctx.closePath();
    ctx.fill();

    // Right side face
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy - 2);
    ctx.lineTo(cx + 7, cy - 6);
    ctx.lineTo(cx + 10, cy - 3);
    ctx.lineTo(cx + 10, cy + 4);
    ctx.lineTo(cx + 8, cy + 5);
    ctx.closePath();
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 5);
    ctx.lineTo(cx + 2, cy - 5);
    ctx.lineTo(cx + 3, cy - 3);
    ctx.lineTo(cx - 3, cy - 3);
    ctx.closePath();
    ctx.fill();

    // Edge lines
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 2);
    ctx.lineTo(cx + 8, cy - 2);
    ctx.lineTo(cx + 8, cy + 5);
    ctx.stroke();

    // Small sparkle
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(cx - 1, cy - 5);
    ctx.lineTo(cx, cy - 6.5);
    ctx.lineTo(cx + 1, cy - 5);
    ctx.lineTo(cx, cy - 3.5);
    ctx.closePath();
    ctx.fill();

    return c;
  }

  function drawGemResource() {
    const c = createCanvas(RESOURCE_SIZE, RESOURCE_SIZE);
    const ctx = c.getContext('2d');
    const cx = 16, cy = 16;

    // Background circle
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Diamond/gem shape
    // Top facets
    const gemGrad = ctx.createLinearGradient(cx - 8, cy - 8, cx + 8, cy + 8);
    gemGrad.addColorStop(0, '#a855f7');
    gemGrad.addColorStop(0.3, '#c084fc');
    gemGrad.addColorStop(0.5, '#06b6d4');
    gemGrad.addColorStop(0.7, '#a855f7');
    gemGrad.addColorStop(1, '#7c3aed');

    // Upper portion (crown)
    ctx.fillStyle = gemGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);        // top point
    ctx.lineTo(cx + 8, cy - 3);     // top right
    ctx.lineTo(cx + 6, cy + 1);     // mid right
    ctx.lineTo(cx - 6, cy + 1);     // mid left
    ctx.lineTo(cx - 8, cy - 3);     // top left
    ctx.closePath();
    ctx.fill();

    // Lower portion (pavilion)
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 1);
    ctx.lineTo(cx + 6, cy + 1);
    ctx.lineTo(cx, cy + 10);
    ctx.closePath();
    ctx.fill();

    // Facet lines
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.5;
    // Top facets
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx - 3, cy + 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx + 3, cy + 1);
    ctx.stroke();
    // Girdle line
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 1);
    ctx.lineTo(cx + 6, cy + 1);
    ctx.stroke();
    // Pavilion facets
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy + 1);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy + 1);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    // Outer edge
    ctx.strokeStyle = 'rgba(80,30,120,0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx + 8, cy - 3);
    ctx.lineTo(cx + 6, cy + 1);
    ctx.lineTo(cx, cy + 10);
    ctx.lineTo(cx - 6, cy + 1);
    ctx.lineTo(cx - 8, cy - 3);
    ctx.closePath();
    ctx.stroke();

    // Sparkle highlight
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    // Star sparkle
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 5);
    ctx.lineTo(cx - 1, cy - 7);
    ctx.lineTo(cx, cy - 5);
    ctx.lineTo(cx + 1.5, cy - 6);
    ctx.lineTo(cx, cy - 4.5);
    ctx.lineTo(cx - 1.5, cy - 4);
    ctx.closePath();
    ctx.fill();

    // Secondary sparkle
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(cx + 4, cy - 2, 1, 0, Math.PI * 2);
    ctx.fill();

    return c;
  }

  // ─── Public API ───────────────────────────────────────

  const unitDrawers = {
    warrior: drawWarrior,
    archer: drawArcher,
    knight: drawKnight,
    siege: drawSiege,
    musket: drawMusket,
    settler: drawSettler,
  };

  const terrainDrawers = {
    water: drawWater,
    plains: drawPlains,
    grass: drawGrass,
    forest: drawForest,
    hills: drawHills,
    mountain: drawMountain,
    desert: drawDesert,
  };

  const resourceDrawers = {
    horse: drawHorseResource,
    iron: drawIronResource,
    gem: drawGemResource,
  };

  window.Assets = {
    init: function() {
      console.log('[Assets] 스프라이트 생성 시작...');

      // Generate all terrain sprites
      for (const type in terrainDrawers) {
        try {
          terrainCache.set(type, terrainDrawers[type]());
          console.log('[Assets] 지형:', type, '✓');
        } catch (e) {
          console.error('[Assets] 지형 생성 실패:', type, e);
        }
      }

      // Generate all unit sprites (one per type per civ color)
      for (const type in unitDrawers) {
        for (let i = 0; i < CIV_COLORS.length; i++) {
          try {
            unitCache.set(type + '_' + i, unitDrawers[type](CIV_COLORS[i]));
          } catch (e) {
            console.error('[Assets] 유닛 생성 실패:', type, i, e);
          }
        }
        console.log('[Assets] 유닛:', type, '✓');
      }

      // Generate city sprites (one per civ color)
      for (let i = 0; i < CIV_COLORS.length; i++) {
        try {
          cityCache.set(i, drawCity(CIV_COLORS[i]));
        } catch (e) {
          console.error('[Assets] 도시 생성 실패:', i, e);
        }
      }
      console.log('[Assets] 도시 ✓');

      // Generate resource sprites
      for (const type in resourceDrawers) {
        try {
          resourceCache.set(type, resourceDrawers[type]());
          console.log('[Assets] 자원:', type, '✓');
        } catch (e) {
          console.error('[Assets] 자원 생성 실패:', type, e);
        }
      }

      console.log('[Assets] 스프라이트 생성 완료. 지형:', terrainCache.size,
        '유닛:', unitCache.size, '도시:', cityCache.size, '자원:', resourceCache.size);
    },

    getTerrainSprite: function(terrainType) {
      return terrainCache.get(terrainType) || null;
    },

    getUnitSprite: function(unitType, civColorIndex) {
      return unitCache.get(unitType + '_' + civColorIndex) || null;
    },

    getCitySprite: function(civColorIndex, population) {
      // Population number is drawn by renderer, we just return the base city sprite
      return cityCache.get(civColorIndex) || null;
    },

    getResourceSprite: function(resourceType) {
      return resourceCache.get(resourceType) || null;
    },
  };
})();
