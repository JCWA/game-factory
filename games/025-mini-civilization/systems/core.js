/**
 * 025 - 미니 문명 시뮬레이터: Core Game System
 * Namespace: window.Game
 *
 * Provides: state, data definitions (tech tree, buildings, units, terrains),
 * city management, unit movement, combat, victory checks, save/load.
 *
 * Does NOT implement: rendering, AI, UI, hex grid geometry, noise generation.
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // DATA DEFINITIONS
  // ─────────────────────────────────────────────

  const TERRAINS = {
    plains:  { name: '평원', food: 2, production: 1, gold: 0, moveCost: 1,  color: '#90BE6D', passable: true,  defenseBonus: 0 },
    grass:   { name: '초원', food: 3, production: 0, gold: 0, moveCost: 1,  color: '#43AA8B', passable: true,  defenseBonus: 0 },
    forest:  { name: '숲',   food: 1, production: 2, gold: 0, moveCost: 2,  color: '#2D6A4F', passable: true,  defenseBonus: 2 },
    mountain:{ name: '산',   food: 0, production: 3, gold: 1, moveCost: 3,  color: '#6C757D', passable: true,  defenseBonus: 4 },
    desert:  { name: '사막', food: 0, production: 1, gold: 2, moveCost: 1,  color: '#F4D35E', passable: true,  defenseBonus: 0 },
    water:   { name: '물',   food: 0, production: 0, gold: 1, moveCost: Infinity, color: '#277DA1', passable: false, defenseBonus: 0 },
    hills:   { name: '언덕', food: 1, production: 2, gold: 0, moveCost: 2,  color: '#B5838D', passable: true,  defenseBonus: 2 },
  };

  const BUILDINGS = {
    granary:    { name: '곡물창고', cost: 30,  effect: { food: 3 },         description: '식량 +3/턴' },
    workshop:   { name: '작업장',   cost: 40,  effect: { production: 3 },   description: '생산력 +3/턴' },
    market:     { name: '시장',     cost: 50,  effect: { gold: 4 },         description: '금 +4/턴' },
    barracks:   { name: '병영',     cost: 40,  effect: { militaryBoost: 0.5 }, description: '군사유닛 생산속도 +50%' },
    walls:      { name: '성벽',     cost: 60,  effect: { defense: 5, hp: 50 }, description: '도시 방어력 +5, 체력 +50' },
    library:    { name: '도서관',   cost: 50,  effect: { research: 3 },     description: '연구력 +3/턴' },
    temple:     { name: '신전',     cost: 60,  effect: { happiness: 2 },    description: '행복도 +2' },
    palace:     { name: '궁전',     cost: 80,  effect: { food: 1, production: 1, gold: 1, research: 1 }, description: '모든 자원 +1/턴 (수도만)' },
  };

  const UNITS = {
    warrior:  { name: '전사',     attack: 5,  defense: 3, moves: 2, cost: 20, tech: null,          icon: '⚔' },
    archer:   { name: '궁수',     attack: 7,  defense: 2, moves: 2, cost: 30, tech: 'archery',     icon: '🏹' },
    knight:   { name: '기사',     attack: 10, defense: 5, moves: 3, cost: 50, tech: 'chivalry',    icon: '🐎' },
    siege:    { name: '공성추',   attack: 15, defense: 2, moves: 1, cost: 60, tech: 'gunpowder',   icon: '💣' },
    musketeer:{ name: '머스킷병', attack: 12, defense: 8, moves: 2, cost: 70, tech: 'industrialRevolution', icon: '🔫' },
  };

  const techTree = {
    // Ancient Era
    agriculture:    { name: '농업',     cost: 20,  era: 'ancient',  prereqs: [],               unlocks: ['granary'] },
    irrigation:     { name: '관개',     cost: 35,  era: 'ancient',  prereqs: ['agriculture'],   unlocks: [] },
    animalHusbandry:{ name: '축산',     cost: 50,  era: 'ancient',  prereqs: ['irrigation'],    unlocks: [] },
    mining:         { name: '채광',     cost: 20,  era: 'ancient',  prereqs: [],               unlocks: ['workshop'] },
    smelting:       { name: '제련',     cost: 35,  era: 'ancient',  prereqs: ['mining'],        unlocks: [] },
    blacksmithing:  { name: '대장장이', cost: 50,  era: 'ancient',  prereqs: ['smelting'],      unlocks: [] },
    combat:         { name: '전투술',   cost: 20,  era: 'ancient',  prereqs: [],               unlocks: ['barracks'] },
    archery:        { name: '궁술',     cost: 35,  era: 'ancient',  prereqs: ['combat'],        unlocks: ['archer'] },
    strategy:       { name: '전략',     cost: 50,  era: 'ancient',  prereqs: ['archery'],       unlocks: [] },

    // Medieval Era (requires 3+ ancient techs)
    chivalry:       { name: '기사도',   cost: 80,  era: 'medieval', prereqs: [],               unlocks: ['knight'], eraReq: { era: 'ancient', count: 3 } },
    gunpowder:      { name: '화약',     cost: 120, era: 'medieval', prereqs: ['chivalry'],      unlocks: ['siege'] },
    navigation:     { name: '항해술',   cost: 80,  era: 'medieval', prereqs: [],               unlocks: [], eraReq: { era: 'ancient', count: 3 } },
    exploration:    { name: '탐험',     cost: 120, era: 'medieval', prereqs: ['navigation'],    unlocks: [] },
    architecture:   { name: '건축학',   cost: 80,  era: 'medieval', prereqs: [],               unlocks: ['walls', 'temple'], eraReq: { era: 'ancient', count: 3 } },
    cityPlanning:   { name: '도시계획', cost: 120, era: 'medieval', prereqs: ['architecture'],  unlocks: ['palace'] },

    // Modern Era (requires 3+ medieval techs)
    industrialRevolution: { name: '산업혁명', cost: 200, era: 'modern', prereqs: [],            unlocks: ['musketeer'], eraReq: { era: 'medieval', count: 3 } },
    railroad:             { name: '철도',     cost: 300, era: 'modern', prereqs: ['industrialRevolution'], unlocks: [] },
    democracy:            { name: '민주주의', cost: 200, era: 'modern', prereqs: [],            unlocks: [], eraReq: { era: 'medieval', count: 3 } },
    freeTrade:            { name: '자유무역', cost: 300, era: 'modern', prereqs: ['democracy'],  unlocks: ['market'] },
  };

  const CITY_NAMES = {
    0: ['서울', '부산', '인천', '대전', '광주', '대구', '울산', '수원'],
    1: ['용성', '화산', '비룡', '용암', '금린', '화염', '용궁', '천둥'],
    2: ['파도', '해류', '산호', '진주', '등대', '포구', '갯벌', '수평선'],
  };

  const CIV_NAMES = {
    0: '플레이어',
    1: '용의 제국',
    2: '바다의 왕국',
  };

  const CIV_PERSONALITIES = ['aggressive', 'expansive', 'scholar'];

  const UNIT_MAX_HP = 20;
  const MAX_TURNS = 100;
  const MAP_WIDTH = 20;
  const MAP_HEIGHT = 15;
  const SAVE_KEY = 'miniCiv_save';

  // ─────────────────────────────────────────────
  // HELPER UTILITIES
  // ─────────────────────────────────────────────

  let _nextId = 1;
  function uid(prefix) {
    return prefix + (_nextId++);
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /**
   * Get hex neighbors using offset coordinates (odd-r: odd rows shift right).
   */
  function getNeighbors(x, y) {
    const parity = y & 1;
    const dirs = parity
      ? [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]
      : [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
    const result = [];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
        result.push({ x: nx, y: ny });
      }
    }
    return result;
  }

  /**
   * Get all tiles within a given radius from (cx, cy).
   */
  function getTilesInRadius(cx, cy, radius) {
    const results = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;
        if (hexDistance(cx, cy, nx, ny) <= radius) {
          results.push({ x: nx, y: ny });
        }
      }
    }
    return results;
  }

  /**
   * Hex distance using cube coordinates (offset → cube → manhattan / 2).
   */
  function hexDistance(x1, y1, x2, y2) {
    const c1 = offsetToCube(x1, y1);
    const c2 = offsetToCube(x2, y2);
    return Math.max(Math.abs(c1.q - c2.q), Math.abs(c1.r - c2.r), Math.abs(c1.s - c2.s));
  }

  function offsetToCube(x, y) {
    const q = x - (y - (y & 1)) / 2;
    const r = y;
    const s = -q - r;
    return { q, r, s };
  }

  function getTile(x, y) {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return null;
    return Game.state.tiles[y * MAP_WIDTH + x];
  }

  // ─────────────────────────────────────────────
  // GAME OBJECT
  // ─────────────────────────────────────────────

  const Game = {
    state: null,
    techTree: techTree,
    BUILDINGS: BUILDINGS,
    UNITS: UNITS,
    TERRAINS: TERRAINS,
    CITY_NAMES: CITY_NAMES,
    CIV_NAMES: CIV_NAMES,
    MAP_WIDTH: MAP_WIDTH,
    MAP_HEIGHT: MAP_HEIGHT,
    UNIT_MAX_HP: UNIT_MAX_HP,
    MAX_TURNS: MAX_TURNS,

    // Expose helpers for other modules
    hexDistance: hexDistance,
    getNeighbors: getNeighbors,
    getTilesInRadius: getTilesInRadius,
    getTile: getTile,
    offsetToCube: offsetToCube,

    // ─────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────

    init: function () {
      _nextId = 1;

      // Create blank tiles (map generator will fill terrain later)
      const tiles = [];
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          tiles.push({
            x: x,
            y: y,
            terrain: 'plains',
            resource: null,
            explored: { 0: false, 1: false, 2: false },
            improvement: null,
          });
        }
      }

      // Create civilizations
      const civs = [];
      for (let i = 0; i < 3; i++) {
        const civ = {
          id: i,
          name: CIV_NAMES[i],
          isAI: i !== 0,
          personality: i === 0 ? null : CIV_PERSONALITIES[Math.floor(Math.random() * CIV_PERSONALITIES.length)],
          gold: 50,
          researchPoints: 0,
          currentResearch: null,
          technologies: [],
          diplomacy: {},
          cities: [],
          units: [],
          cityNameIndex: 0,
          score: 0,
        };
        // Set up diplomacy toward other civs
        for (let j = 0; j < 3; j++) {
          if (j !== i) {
            civ.diplomacy[j] = { status: 'neutral', favor: 50, warHistory: false, trading: false };
          }
        }
        civs.push(civ);
      }

      Game.state = {
        turn: 1,
        currentCiv: 0,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
        tiles: tiles,
        civilizations: civs,
        winner: null,
        winCondition: null,
        log: [],
      };

      return Game.state;
    },

    // ─────────────────────────────────────────
    // CITY MANAGEMENT
    // ─────────────────────────────────────────

    createCity: function (civId, x, y, name) {
      const civ = Game.state.civilizations[civId];
      if (!civ) return null;

      const tile = getTile(x, y);
      if (!tile || !TERRAINS[tile.terrain].passable) return null;

      // Check no other city on this tile
      for (const c of Game.state.civilizations) {
        for (const city of c.cities) {
          if (city.x === x && city.y === y) return null;
        }
      }

      const cityName = name || CITY_NAMES[civId][civ.cityNameIndex] || ('도시 ' + civ.cities.length);
      civ.cityNameIndex = (civ.cityNameIndex || 0) + 1;

      const isCapital = civ.cities.length === 0;

      const city = {
        id: uid('c'),
        name: cityName,
        civId: civId,
        x: x,
        y: y,
        isCapital: isCapital,
        population: 1,
        hp: 100,
        maxHp: 100,
        defense: 2,
        food: 0,
        production: 0,
        happiness: 5,
        buildings: [],
        productionQueue: [],
        foodPerTurn: 0,
        productionPerTurn: 0,
        goldPerTurn: 0,
        researchPerTurn: 0,
      };

      civ.cities.push(city);
      Game._updateCityYields(city);

      // Reveal tiles around the city
      Game._revealTiles(civId, x, y, 2);

      Game._log(civ.name + '이(가) ' + cityName + '을(를) 건설했습니다.');
      return city;
    },

    _updateCityYields: function (city) {
      let food = 0, prod = 0, gold = 0, research = 0;

      // Base yields from surrounding tiles (radius 2)
      const surroundingTiles = getTilesInRadius(city.x, city.y, 2);
      for (const pos of surroundingTiles) {
        const tile = getTile(pos.x, pos.y);
        if (tile) {
          const t = TERRAINS[tile.terrain];
          food += t.food;
          prod += t.production;
          gold += t.gold;

          // Special resources
          if (tile.resource === 'gems') gold += 3;
        }
      }

      // Research from population
      research += Math.floor(city.population / 2);

      // Building bonuses
      for (const bId of city.buildings) {
        const b = BUILDINGS[bId];
        if (b && b.effect) {
          if (b.effect.food) food += b.effect.food;
          if (b.effect.production) prod += b.effect.production;
          if (b.effect.gold) gold += b.effect.gold;
          if (b.effect.research) research += b.effect.research;
        }
      }

      // Happiness calculation: base 5 - population + building bonuses
      let happiness = 5 - city.population;
      for (const bId of city.buildings) {
        const b = BUILDINGS[bId];
        if (b && b.effect && b.effect.happiness) {
          happiness += b.effect.happiness;
        }
      }
      city.happiness = happiness;

      // Happiness penalty
      if (happiness < 0) {
        prod = Math.floor(prod * 0.5);
      }

      city.foodPerTurn = food;
      city.productionPerTurn = prod;
      city.goldPerTurn = gold;
      city.researchPerTurn = research;
    },

    produceInCity: function (city) {
      if (city.productionQueue.length === 0) return null;

      const item = city.productionQueue[0];
      let prodAmount = city.productionPerTurn;

      // Barracks boost for military units
      if (item.type === 'unit' && city.buildings.includes('barracks')) {
        prodAmount = Math.floor(prodAmount * 1.5);
      }

      item.remaining -= prodAmount;

      if (item.remaining <= 0) {
        city.productionQueue.shift();
        Game._completeProduction(city, item);
        return item;
      }
      return null;
    },

    _completeProduction: function (city, item) {
      const civ = Game.state.civilizations[city.civId];

      if (item.type === 'building') {
        if (!city.buildings.includes(item.id)) {
          city.buildings.push(item.id);
          Game._updateCityYields(city);
          Game._log(city.name + '에서 ' + BUILDINGS[item.id].name + ' 건설 완료!');
        }
      } else if (item.type === 'unit') {
        const unitDef = UNITS[item.id];
        if (unitDef) {
          const unit = {
            id: uid('u'),
            type: item.id,
            civId: city.civId,
            x: city.x,
            y: city.y,
            hp: UNIT_MAX_HP,
            maxHp: UNIT_MAX_HP,
            movesLeft: unitDef.moves,
            maxMoves: unitDef.moves,
          };

          // Iron resource bonus
          if (Game._civHasResource(city.civId, 'iron')) {
            unit.attackBonus = 2;
          }
          // Horse resource bonus for knight
          if (item.id === 'knight' && Game._civHasResource(city.civId, 'horse')) {
            unit.moveBonus = 1;
            unit.maxMoves += 1;
            unit.movesLeft = unit.maxMoves;
          }

          civ.units.push(unit);
          Game._log(city.name + '에서 ' + unitDef.name + ' 생산 완료!');
        }
      } else if (item.type === 'project') {
        // Space program project for tech victory
        if (item.id === 'spaceProgram') {
          Game.state.winner = city.civId;
          Game.state.winCondition = 'technology';
          Game._log(civ.name + '이(가) 우주 프로그램을 완성하여 기술 승리!');
        }
      }
    },

    /**
     * Add an item to a city's production queue.
     * type: 'building' | 'unit' | 'project'
     */
    addToProductionQueue: function (city, type, id) {
      let cost = 0;
      if (type === 'building') {
        if (!BUILDINGS[id]) return false;
        if (city.buildings.includes(id)) return false; // already built
        // Check if already in queue
        if (city.productionQueue.some(q => q.type === 'building' && q.id === id)) return false;
        cost = BUILDINGS[id].cost;
      } else if (type === 'unit') {
        if (!UNITS[id]) return false;
        // Check tech requirement
        const techReq = UNITS[id].tech;
        if (techReq) {
          const civ = Game.state.civilizations[city.civId];
          if (!civ.technologies.includes(techReq)) return false;
        }
        cost = UNITS[id].cost;
      } else if (type === 'project') {
        if (id === 'spaceProgram') cost = 200;
        else return false;
      } else {
        return false;
      }

      city.productionQueue.push({ type, id, remaining: cost, totalCost: cost });
      return true;
    },

    // ─────────────────────────────────────────
    // UNIT MOVEMENT
    // ─────────────────────────────────────────

    moveUnit: function (unit, targetX, targetY) {
      if (unit.movesLeft <= 0) return { success: false, reason: '이동력이 없습니다.' };

      const targetTile = getTile(targetX, targetY);
      if (!targetTile) return { success: false, reason: '맵 밖입니다.' };

      const terrain = TERRAINS[targetTile.terrain];
      if (!terrain.passable) return { success: false, reason: '이동할 수 없는 지형입니다.' };

      // Check if adjacent
      const dist = hexDistance(unit.x, unit.y, targetX, targetY);
      if (dist !== 1) return { success: false, reason: '인접한 타일로만 이동할 수 있습니다.' };

      // Check stacking: no friendly unit on target
      const civ = Game.state.civilizations[unit.civId];
      for (const u of civ.units) {
        if (u.id !== unit.id && u.x === targetX && u.y === targetY) {
          return { success: false, reason: '아군 유닛이 이미 있습니다.' };
        }
      }

      // Check for enemy unit (initiate combat instead)
      for (const c of Game.state.civilizations) {
        if (c.id === unit.civId) continue;
        for (const eu of c.units) {
          if (eu.x === targetX && eu.y === targetY) {
            return { success: false, reason: '적 유닛이 있습니다. 전투를 사용하세요.', enemyUnit: eu };
          }
        }
      }

      const moveCost = terrain.moveCost;
      if (unit.movesLeft < moveCost) return { success: false, reason: '이동력이 부족합니다.' };

      // Move
      unit.x = targetX;
      unit.y = targetY;
      unit.movesLeft -= moveCost;

      // Reveal tiles
      Game._revealTiles(unit.civId, targetX, targetY, 2);

      return { success: true, moveCost: moveCost };
    },

    // ─────────────────────────────────────────
    // COMBAT
    // ─────────────────────────────────────────

    combat: function (attacker, defender) {
      const aDef = UNITS[attacker.type];
      const dDef = UNITS[defender.type];
      if (!aDef || !dDef) return null;

      // Terrain defense bonus for defender
      const defTile = getTile(defender.x, defender.y);
      let terrainBonus = 0;
      if (defTile) {
        terrainBonus = TERRAINS[defTile.terrain].defenseBonus;
      }

      // City defense bonus
      let cityDefenseBonus = 0;
      for (const c of Game.state.civilizations) {
        for (const city of c.cities) {
          if (city.x === defender.x && city.y === defender.y && city.civId === defender.civId) {
            cityDefenseBonus = city.defense;
            break;
          }
        }
      }

      const attackBonus = attacker.attackBonus || 0;
      const defenderDefense = dDef.defense + terrainBonus + cityDefenseBonus;

      // Attacker damages defender
      const atkDamage = Math.max(1, Math.round((aDef.attack + attackBonus) * rand(0.8, 1.2) - defenderDefense * 0.5));

      // Defender counterattacks
      const defCounterDamage = Math.max(0, Math.round(dDef.attack * 0.5 * rand(0.8, 1.2) - (aDef.defense + (attacker.attackBonus ? 0 : 0)) * 0.3));

      defender.hp -= atkDamage;
      attacker.hp -= defCounterDamage;

      // Attacker uses all remaining moves
      attacker.movesLeft = 0;

      const result = {
        attackerDamage: defCounterDamage,
        defenderDamage: atkDamage,
        attackerDied: attacker.hp <= 0,
        defenderDied: defender.hp <= 0,
      };

      Game._log(
        UNITS[attacker.type].name + ' → ' + UNITS[defender.type].name +
        ' (피해: ' + atkDamage + ' / 반격: ' + defCounterDamage + ')'
      );

      // Remove dead units
      if (defender.hp <= 0) {
        Game._removeUnit(defender);
        Game._log(UNITS[defender.type].name + '이(가) 파괴되었습니다.');
        // Move attacker to defender position if alive
        if (attacker.hp > 0) {
          attacker.x = defender.x;
          attacker.y = defender.y;
        }
      }
      if (attacker.hp <= 0) {
        Game._removeUnit(attacker);
        Game._log(UNITS[attacker.type].name + '이(가) 파괴되었습니다.');
      }

      return result;
    },

    /**
     * Attack a city directly with a unit.
     */
    attackCity: function (attacker, city) {
      const aDef = UNITS[attacker.type];
      if (!aDef) return null;

      const attackBonus = attacker.attackBonus || 0;
      const damage = Math.max(1, Math.round((aDef.attack + attackBonus) * rand(0.8, 1.2) - city.defense * 0.5));
      const counterDamage = Math.max(0, Math.round(city.defense * rand(0.8, 1.2) - aDef.defense * 0.3));

      city.hp -= damage;
      attacker.hp -= counterDamage;
      attacker.movesLeft = 0;

      Game._log(aDef.name + '이(가) ' + city.name + '을(를) 공격! (피해: ' + damage + ')');

      const result = {
        cityDamage: damage,
        attackerDamage: counterDamage,
        attackerDied: attacker.hp <= 0,
        cityCaptured: city.hp <= 0,
      };

      if (attacker.hp <= 0) {
        Game._removeUnit(attacker);
      }

      if (city.hp <= 0) {
        Game.captureCity(city, attacker.civId);
        if (attacker.hp > 0) {
          attacker.x = city.x;
          attacker.y = city.y;
        }
      }

      return result;
    },

    captureCity: function (city, newOwnerCivId) {
      const oldOwnerCivId = city.civId;
      const oldOwner = Game.state.civilizations[oldOwnerCivId];
      const newOwner = Game.state.civilizations[newOwnerCivId];

      // Remove from old owner
      oldOwner.cities = oldOwner.cities.filter(c => c.id !== city.id);

      // Transfer to new owner
      city.civId = newOwnerCivId;
      city.hp = 50; // reduced hp after capture
      city.population = Math.max(1, city.population - 1);
      city.productionQueue = [];
      city.production = 0;

      const wasCapital = city.isCapital;
      city.isCapital = false;

      newOwner.cities.push(city);
      Game._updateCityYields(city);

      Game._log(newOwner.name + '이(가) ' + city.name + '을(를) 점령했습니다!');

      // If it was a capital, check for military victory
      if (wasCapital) {
        Game.checkVictory();
      }
    },

    _removeUnit: function (unit) {
      for (const civ of Game.state.civilizations) {
        const idx = civ.units.findIndex(u => u.id === unit.id);
        if (idx !== -1) {
          civ.units.splice(idx, 1);
          return;
        }
      }
    },

    // ─────────────────────────────────────────
    // RESEARCH
    // ─────────────────────────────────────────

    canResearch: function (civId, techId) {
      const civ = Game.state.civilizations[civId];
      const tech = techTree[techId];
      if (!tech) return false;
      if (civ.technologies.includes(techId)) return false;

      // Check prereqs
      for (const prereq of tech.prereqs) {
        if (!civ.technologies.includes(prereq)) return false;
      }

      // Check era requirements
      if (tech.eraReq) {
        const count = civ.technologies.filter(t => techTree[t] && techTree[t].era === tech.eraReq.era).length;
        if (count < tech.eraReq.count) return false;
      }

      return true;
    },

    getResearchableTechs: function (civId) {
      const result = [];
      for (const techId of Object.keys(techTree)) {
        if (Game.canResearch(civId, techId)) {
          result.push(techId);
        }
      }
      return result;
    },

    setResearch: function (civId, techId) {
      if (!Game.canResearch(civId, techId)) return false;
      const civ = Game.state.civilizations[civId];
      civ.currentResearch = techId;
      civ.researchPoints = 0;
      return true;
    },

    _processResearch: function (civ) {
      if (!civ.currentResearch) return;
      const tech = techTree[civ.currentResearch];
      if (!tech) return;

      // Accumulate research from all cities
      let totalResearch = 0;
      for (const city of civ.cities) {
        totalResearch += city.researchPerTurn;
      }

      civ.researchPoints += totalResearch;

      if (civ.researchPoints >= tech.cost) {
        civ.technologies.push(civ.currentResearch);
        Game._log(civ.name + '이(가) ' + tech.name + ' 연구 완료!');
        civ.currentResearch = null;
        civ.researchPoints = 0;

        // Check tech victory
        Game.checkVictory();
      }
    },

    // ─────────────────────────────────────────
    // TURN PROCESSING
    // ─────────────────────────────────────────

    nextTurn: function () {
      if (Game.state.winner !== null) return;

      for (const civ of Game.state.civilizations) {
        let totalGold = 0;

        // Process each city
        for (const city of civ.cities) {
          Game._updateCityYields(city);

          // Food & population growth
          city.food += city.foodPerTurn;
          const growthThreshold = city.population * 15;
          if (city.food >= growthThreshold) {
            city.food -= growthThreshold;
            city.population += 1;
            Game._updateCityYields(city); // recalc with new pop
            Game._log(city.name + '의 인구가 ' + city.population + '으로 증가!');
          } else if (city.foodPerTurn < 0 && city.food < 0 && city.population > 1) {
            // Starvation
            city.population -= 1;
            city.food = 0;
            Game._updateCityYields(city);
            Game._log(city.name + '에 기아 발생! 인구 감소.');
          }

          // Production
          Game.produceInCity(city);

          // Gold
          totalGold += city.goldPerTurn;

          // City healing
          if (city.hp < city.maxHp) {
            city.hp = Math.min(city.maxHp, city.hp + 5);
          }
        }

        // Unit maintenance: roughly 1 gold per unit
        totalGold -= civ.units.length;
        civ.gold += totalGold;

        // Negative gold penalty
        if (civ.gold < 0) {
          for (const unit of civ.units) {
            unit.hp -= 5;
          }
          // Remove dead units from gold penalty
          civ.units = civ.units.filter(u => {
            if (u.hp <= 0) {
              Game._log(civ.name + '의 ' + UNITS[u.type].name + '이(가) 유지비 부족으로 해산.');
              return false;
            }
            return true;
          });
        }

        // Unit healing & movement reset
        for (const unit of civ.units) {
          // Healing
          let healAmount = 2;
          // Heal more on city tile
          const onCity = civ.cities.some(c => c.x === unit.x && c.y === unit.y);
          if (onCity) healAmount = 5;
          unit.hp = Math.min(unit.maxHp, unit.hp + healAmount);

          // Reset movement
          unit.movesLeft = unit.maxMoves;
        }

        // Research
        Game._processResearch(civ);
      }

      Game.state.turn += 1;

      // Auto-save every 5 turns
      if (Game.state.turn % 5 === 0) {
        Game.save();
      }

      // Check score victory at turn limit
      if (Game.state.turn > MAX_TURNS) {
        Game._resolveScoreVictory();
      }

      Game.checkVictory();
    },

    // ─────────────────────────────────────────
    // VICTORY
    // ─────────────────────────────────────────

    checkVictory: function () {
      if (Game.state.winner !== null) return Game.state.winner;

      // Military victory: all enemy capitals captured
      for (const civ of Game.state.civilizations) {
        const enemies = Game.state.civilizations.filter(c => c.id !== civ.id);
        const allCapitalsCaptured = enemies.every(enemy => {
          // Enemy has no capital city remaining
          return !enemy.cities.some(c => c.isCapital);
        });
        if (allCapitalsCaptured && civ.cities.length > 0) {
          Game.state.winner = civ.id;
          Game.state.winCondition = 'military';
          Game._log(civ.name + '이(가) 모든 적 수도를 점령하여 군사 승리!');
          return civ.id;
        }
      }

      // Technology victory: 4+ modern era techs → space program completed
      // (actual completion is handled by project production)
      for (const civ of Game.state.civilizations) {
        const modernTechs = civ.technologies.filter(t => techTree[t] && techTree[t].era === 'modern').length;
        if (modernTechs >= 4) {
          // Enable space program project but don't auto-win
          // Victory triggered when the project is completed in _completeProduction
        }
      }

      // Elimination: if a civ has no cities and no units, they are out
      for (const civ of Game.state.civilizations) {
        if (civ.cities.length === 0 && civ.units.length === 0) {
          // Check if only one civ remains
          const alive = Game.state.civilizations.filter(c => c.cities.length > 0 || c.units.length > 0);
          if (alive.length === 1) {
            Game.state.winner = alive[0].id;
            Game.state.winCondition = 'military';
            Game._log(alive[0].name + '이(가) 최후의 문명으로 승리!');
            return alive[0].id;
          }
        }
      }

      return null;
    },

    canBuildSpaceProgram: function (civId) {
      const civ = Game.state.civilizations[civId];
      const modernTechs = civ.technologies.filter(t => techTree[t] && techTree[t].era === 'modern').length;
      return modernTechs >= 4;
    },

    calculateScore: function (civId) {
      const civ = Game.state.civilizations[civId];
      if (!civ) return 0;

      let score = 0;
      score += civ.cities.length * 20;                           // 도시 1개당 20점
      for (const city of civ.cities) {
        score += city.population * 5;                            // 인구 1당 5점
      }
      score += civ.technologies.length * 10;                     // 기술 1개당 10점
      score += civ.units.length * 3;                             // 유닛 1개당 3점
      score += Math.floor(Math.max(0, civ.gold) / 10);          // 금 10당 1점

      civ.score = score;
      return score;
    },

    _resolveScoreVictory: function () {
      let bestCiv = null;
      let bestScore = -1;
      for (const civ of Game.state.civilizations) {
        const s = Game.calculateScore(civ.id);
        if (s > bestScore) {
          bestScore = s;
          bestCiv = civ.id;
        }
      }
      if (bestCiv !== null) {
        Game.state.winner = bestCiv;
        Game.state.winCondition = 'score';
        Game._log(Game.state.civilizations[bestCiv].name + '이(가) 점수 ' + bestScore + '점으로 승리!');
      }
    },

    // ─────────────────────────────────────────
    // VISIBILITY
    // ─────────────────────────────────────────

    _revealTiles: function (civId, cx, cy, radius) {
      const tiles = getTilesInRadius(cx, cy, radius);
      for (const pos of tiles) {
        const tile = getTile(pos.x, pos.y);
        if (tile) {
          tile.explored[civId] = true;
        }
      }
    },

    /**
     * Update visibility for a civ based on all their units and cities.
     * Returns set of tile indices currently visible (not just explored).
     */
    getVisibleTiles: function (civId) {
      const visible = new Set();
      const civ = Game.state.civilizations[civId];
      if (!civ) return visible;

      for (const city of civ.cities) {
        const tiles = getTilesInRadius(city.x, city.y, 2);
        for (const pos of tiles) {
          visible.add(pos.y * MAP_WIDTH + pos.x);
        }
      }
      for (const unit of civ.units) {
        const tiles = getTilesInRadius(unit.x, unit.y, 2);
        for (const pos of tiles) {
          visible.add(pos.y * MAP_WIDTH + pos.x);
        }
      }

      // Mark explored
      for (const idx of visible) {
        Game.state.tiles[idx].explored[civId] = true;
      }

      return visible;
    },

    // ─────────────────────────────────────────
    // RESOURCE CHECKS
    // ─────────────────────────────────────────

    _civHasResource: function (civId, resourceType) {
      const civ = Game.state.civilizations[civId];
      for (const city of civ.cities) {
        const tiles = getTilesInRadius(city.x, city.y, 2);
        for (const pos of tiles) {
          const tile = getTile(pos.x, pos.y);
          if (tile && tile.resource === resourceType) return true;
        }
      }
      return false;
    },

    // ─────────────────────────────────────────
    // DIPLOMACY HELPERS
    // ─────────────────────────────────────────

    getDiplomacy: function (civId, otherCivId) {
      const civ = Game.state.civilizations[civId];
      return civ.diplomacy[otherCivId] || null;
    },

    setDiplomacyStatus: function (civId, otherCivId, status) {
      const civ = Game.state.civilizations[civId];
      const other = Game.state.civilizations[otherCivId];
      if (!civ || !other) return;

      if (civ.diplomacy[otherCivId]) civ.diplomacy[otherCivId].status = status;
      if (other.diplomacy[civId]) other.diplomacy[civId].status = status;

      if (status === 'war') {
        if (civ.diplomacy[otherCivId]) civ.diplomacy[otherCivId].warHistory = true;
        if (other.diplomacy[civId]) other.diplomacy[civId].warHistory = true;
        Game._log(civ.name + '이(가) ' + other.name + '에 선전포고!');
      } else if (status === 'peace' || status === 'neutral') {
        Game._log(civ.name + '과(와) ' + other.name + ' 사이에 평화 조약 체결.');
      }
    },

    calculateFavor: function (civId, otherCivId) {
      const civ = Game.state.civilizations[civId];
      const other = Game.state.civilizations[otherCivId];
      const diplo = civ.diplomacy[otherCivId];
      if (!diplo) return 50;

      let favor = 50;

      // Military threat
      const myMilitary = civ.units.length;
      const theirMilitary = other.units.length;
      if (theirMilitary > myMilitary * 2) favor -= 20;

      // Border proximity
      let borderAdjacent = false;
      for (const myCity of civ.cities) {
        for (const theirCity of other.cities) {
          if (hexDistance(myCity.x, myCity.y, theirCity.x, theirCity.y) <= 4) {
            borderAdjacent = true;
            break;
          }
        }
        if (borderAdjacent) break;
      }
      if (borderAdjacent) favor -= 10;

      // Trading
      if (diplo.trading) favor += 15;

      // War history
      if (diplo.warHistory) favor -= 30;

      // Common enemy
      for (const thirdCiv of Game.state.civilizations) {
        if (thirdCiv.id === civId || thirdCiv.id === otherCivId) continue;
        const myDiplo = civ.diplomacy[thirdCiv.id];
        const theirDiplo = other.diplomacy[thirdCiv.id];
        if (myDiplo && theirDiplo && myDiplo.status === 'war' && theirDiplo.status === 'war') {
          favor += 20;
        }
      }

      diplo.favor = clamp(favor, 0, 100);
      return diplo.favor;
    },

    // ─────────────────────────────────────────
    // MILITARY STRENGTH
    // ─────────────────────────────────────────

    getMilitaryStrength: function (civId) {
      const civ = Game.state.civilizations[civId];
      if (!civ) return 0;
      let strength = 0;
      for (const unit of civ.units) {
        const def = UNITS[unit.type];
        if (def) {
          strength += def.attack + def.defense;
        }
      }
      // City defense contribution
      for (const city of civ.cities) {
        strength += city.defense;
      }
      return strength;
    },

    // ─────────────────────────────────────────
    // SAVE / LOAD
    // ─────────────────────────────────────────

    save: function () {
      try {
        const saveData = {
          version: 1,
          timestamp: Date.now(),
          gameState: JSON.parse(JSON.stringify(Game.state)),
          nextId: _nextId,
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        return true;
      } catch (e) {
        console.error('Save failed:', e);
        return false;
      }
    },

    load: function () {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const saveData = JSON.parse(raw);
        if (saveData.version !== 1) return false;
        Game.state = saveData.gameState;
        _nextId = saveData.nextId || 1;
        return true;
      } catch (e) {
        console.error('Load failed:', e);
        return false;
      }
    },

    hasSave: function () {
      return !!localStorage.getItem(SAVE_KEY);
    },

    deleteSave: function () {
      localStorage.removeItem(SAVE_KEY);
    },

    // ─────────────────────────────────────────
    // LOGGING
    // ─────────────────────────────────────────

    _log: function (msg) {
      if (!Game.state) return;
      Game.state.log.push({ turn: Game.state.turn, message: msg });
      // Keep only last 100 log entries
      if (Game.state.log.length > 100) {
        Game.state.log = Game.state.log.slice(-100);
      }
    },

    /**
     * Get log entries, optionally filtered by turn.
     */
    getLog: function (turn) {
      if (turn !== undefined) {
        return Game.state.log.filter(e => e.turn === turn);
      }
      return Game.state.log;
    },

    // ─────────────────────────────────────────
    // QUERY HELPERS (for UI / AI agents)
    // ─────────────────────────────────────────

    getCiv: function (civId) {
      return Game.state.civilizations[civId] || null;
    },

    getUnitAt: function (x, y) {
      for (const civ of Game.state.civilizations) {
        for (const unit of civ.units) {
          if (unit.x === x && unit.y === y) return unit;
        }
      }
      return null;
    },

    getCityAt: function (x, y) {
      for (const civ of Game.state.civilizations) {
        for (const city of civ.cities) {
          if (city.x === x && city.y === y) return city;
        }
      }
      return null;
    },

    getUnitById: function (unitId) {
      for (const civ of Game.state.civilizations) {
        for (const unit of civ.units) {
          if (unit.id === unitId) return unit;
        }
      }
      return null;
    },

    getCityById: function (cityId) {
      for (const civ of Game.state.civilizations) {
        for (const city of civ.cities) {
          if (city.id === cityId) return city;
        }
      }
      return null;
    },

    /**
     * Get buildable buildings for a city (unlocked by tech, not already built).
     */
    getBuildableBuildings: function (city) {
      const civ = Game.state.civilizations[city.civId];
      const result = [];

      for (const [bId, bDef] of Object.entries(BUILDINGS)) {
        // Already built
        if (city.buildings.includes(bId)) continue;
        // Already in queue
        if (city.productionQueue.some(q => q.type === 'building' && q.id === bId)) continue;
        // Palace only in capital
        if (bId === 'palace' && !city.isCapital) continue;

        // Check if unlocked by technology
        let unlocked = false;
        // Buildings without tech requirement are always available
        let requiresTech = false;
        for (const [techId, techDef] of Object.entries(techTree)) {
          if (techDef.unlocks && techDef.unlocks.includes(bId)) {
            requiresTech = true;
            if (civ.technologies.includes(techId)) {
              unlocked = true;
              break;
            }
          }
        }
        if (!requiresTech) unlocked = true;

        if (unlocked) {
          result.push(bId);
        }
      }
      return result;
    },

    /**
     * Get trainable units for a city.
     */
    getTrainableUnits: function (city) {
      const civ = Game.state.civilizations[city.civId];
      const result = [];
      for (const [uId, uDef] of Object.entries(UNITS)) {
        if (uDef.tech && !civ.technologies.includes(uDef.tech)) continue;
        // Horse required for knight
        if (uId === 'knight' && !Game._civHasResource(city.civId, 'horse')) {
          // Still allow but without bonus (per spec horse just gives +1 move bonus)
        }
        result.push(uId);
      }
      return result;
    },

    /**
     * Get research progress as a fraction (0-1) for the current research.
     */
    getResearchProgress: function (civId) {
      const civ = Game.state.civilizations[civId];
      if (!civ || !civ.currentResearch) return { tech: null, progress: 0, total: 0, fraction: 0 };
      const tech = techTree[civ.currentResearch];
      return {
        tech: civ.currentResearch,
        name: tech.name,
        progress: civ.researchPoints,
        total: tech.cost,
        fraction: civ.researchPoints / tech.cost,
      };
    },

    /**
     * Get the total research per turn for a civ.
     */
    getTotalResearchPerTurn: function (civId) {
      const civ = Game.state.civilizations[civId];
      if (!civ) return 0;
      let total = 0;
      for (const city of civ.cities) {
        total += city.researchPerTurn;
      }
      return total;
    },
  };

  // Export to global namespace
  window.Game = Game;
})();
