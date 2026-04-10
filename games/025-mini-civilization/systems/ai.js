/**
 * 025 - 미니 문명 시뮬레이터: AI System
 * Namespace: window.AI
 *
 * Depends on:
 *   - Game.state (game data)
 *   - Game.moveUnit(unit, x, y)
 *   - Game.combat(attacker, target)
 *   - Game.buildCity(unit)
 *   - Game.produceUnit(cityId, unitType)
 *   - Game.produceBuilding(cityId, buildingId)
 *   - Game.startResearch(civId, techId)
 *   - Game.declareWar(fromCivId, toCivId)
 *   - Game.proposeTrade(fromCivId, toCivId, offer)
 *   - Game.makePeace(fromCivId, toCivId)
 *   - HexMap.findPath(startX, startY, endX, endY, tiles, width, height)
 *   - HexMap.distance(x1, y1, x2, y2)
 *   - HexMap.getNeighbors(x, y)
 */

window.AI = (() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Personalities
  // ---------------------------------------------------------------------------

  const PERSONALITIES = {
    aggressive: {
      name: 'aggressive',
      label: '공격적',
      militaryWeight: 1.5,
      expansionWeight: 0.8,
      researchWeight: 0.6,
      warThreshold: 0.6,   // lower = more likely to declare war
      favorWarPenalty: -10, // extra penalty on favor from military gap
    },
    expansive: {
      name: 'expansive',
      label: '확장적',
      militaryWeight: 0.9,
      expansionWeight: 1.5,
      researchWeight: 0.8,
      warThreshold: 1.0,
      favorWarPenalty: 0,
    },
    scholarly: {
      name: 'scholarly',
      label: '학자적',
      militaryWeight: 0.7,
      expansionWeight: 0.8,
      researchWeight: 1.5,
      warThreshold: 1.4,   // very reluctant to go to war
      favorWarPenalty: 5,   // bonus favor (peaceful)
    },
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getCiv(civId) {
    return Game.state.civilizations[civId];
  }

  function getPersonality(civId) {
    const civ = getCiv(civId);
    return PERSONALITIES[civ.personality] || PERSONALITIES.expansive;
  }

  function allCivIds() {
    return Game.state.civilizations.map((_, i) => i);
  }

  function enemyCivIds(civId) {
    return allCivIds().filter(id => id !== civId);
  }

  function isAtWar(civId, otherId) {
    const civ = getCiv(civId);
    return civ.diplomacy &&
      civ.diplomacy[otherId] &&
      civ.diplomacy[otherId].status === 'war';
  }

  function militaryStrength(civId) {
    const civ = getCiv(civId);
    if (!civ || !civ.units) return 0;
    const UNIT_POWER = {
      warrior: 8, archer: 9, knight: 15, siege: 17, musketeer: 20, settler: 0,
    };
    return civ.units.reduce((sum, u) => {
      return sum + (UNIT_POWER[u.type] || 5) * (u.hp / (u.maxHp || 20));
    }, 0);
  }

  function totalGoldPerTurn(civId) {
    const civ = getCiv(civId);
    if (!civ || !civ.cities) return 0;
    return civ.cities.reduce((sum, c) => sum + (c.goldPerTurn || 0), 0);
  }

  function totalFoodPerTurn(civId) {
    const civ = getCiv(civId);
    if (!civ || !civ.cities) return 0;
    return civ.cities.reduce((sum, c) => sum + (c.foodPerTurn || 0), 0);
  }

  function hasTech(civId, techId) {
    const civ = getCiv(civId);
    return civ.technologies && civ.technologies.includes(techId);
  }

  function cityCount(civId) {
    const civ = getCiv(civId);
    return civ.cities ? civ.cities.length : 0;
  }

  function unitCount(civId) {
    const civ = getCiv(civId);
    return civ.units ? civ.units.length : 0;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function randRange(lo, hi) {
    return lo + Math.random() * (hi - lo);
  }

  // ---------------------------------------------------------------------------
  // Threat Assessment
  // ---------------------------------------------------------------------------

  /**
   * Count enemy units near any of civId's cities (within range tiles).
   * Returns a threat level 0..N (number of threatening units).
   */
  function assessThreat(civId) {
    const civ = getCiv(civId);
    if (!civ.cities || civ.cities.length === 0) return 0;

    let threatCount = 0;
    const THREAT_RANGE = 5;

    for (const other of enemyCivIds(civId)) {
      const otherCiv = getCiv(other);
      if (!otherCiv || !otherCiv.units) continue;
      for (const unit of otherCiv.units) {
        for (const city of civ.cities) {
          const dist = HexMap.distance(unit.x, unit.y, city.x, city.y);
          if (dist <= THREAT_RANGE) {
            threatCount++;
            break; // count unit once even if near multiple cities
          }
        }
      }
    }
    return threatCount;
  }

  // ---------------------------------------------------------------------------
  // Action Evaluation (Utility AI)
  // ---------------------------------------------------------------------------

  /**
   * Score all candidate actions for a civ. Returns sorted array of
   * { action, score, params }.
   */
  function evaluateActions(civId) {
    const civ = getCiv(civId);
    const personality = getPersonality(civId);
    const threat = assessThreat(civId);
    const cities = civ.cities || [];
    const units = civ.units || [];
    const gold = civ.gold || 0;
    const numCities = cities.length;
    const numUnits = units.length;
    const foodShortage = totalFoodPerTurn(civId) < numCities * 2;
    const goldShortage = gold < 10 || totalGoldPerTurn(civId) < 0;

    const candidates = [];

    // 1. Build city (settler production -> move -> build)
    // Score = (numCities < 3) ? 80 : 20 - numCities * 10
    {
      let score = numCities < 3 ? 80 : Math.max(0, 20 - numCities * 10);
      score *= personality.expansionWeight;
      // If we already have a settler in the field, reduce urgency
      const hasSettler = units.some(u => u.type === 'settler');
      if (hasSettler) score *= 0.3;
      candidates.push({ action: 'build_city', score, params: {} });
    }

    // 2. Military unit production
    // Score = max(0, 50 - numUnits * 10 + threat * 20)
    {
      let score = Math.max(0, 50 - numUnits * 10 + threat * 20);
      score *= personality.militaryWeight;
      // Boost if at war
      const atWar = enemyCivIds(civId).some(id => isAtWar(civId, id));
      if (atWar) score += 25;
      candidates.push({ action: 'produce_military', score, params: {} });
    }

    // 3. Building construction
    // Score = 40 + (foodShortage ? 20 : 0) + (goldShortage ? 15 : 0)
    {
      let score = 40 + (foodShortage ? 20 : 0) + (goldShortage ? 15 : 0);
      candidates.push({ action: 'build_building', score, params: {} });
    }

    // 4. Tech research selection
    // Score = 30 + (scholarly ? 25 : 0)
    {
      let score = 30 + (personality.name === 'scholarly' ? 25 : 0);
      score *= personality.researchWeight;
      // Boost if nothing is being researched
      if (!civ.currentResearch) score += 20;
      candidates.push({ action: 'select_research', score, params: {} });
    }

    // 5. War declaration
    // Score = (military > enemy * 1.5 && aggressive) ? 70 : 10
    for (const otherId of enemyCivIds(civId)) {
      if (isAtWar(civId, otherId)) continue;
      const myPower = militaryStrength(civId);
      const theirPower = militaryStrength(otherId);
      const isAggressive = personality.name === 'aggressive';
      let score;
      if (myPower > theirPower * 1.5 && isAggressive) {
        score = 70;
      } else if (myPower > theirPower * 2.0) {
        score = 50; // even non-aggressive civs may strike if dominant
      } else {
        score = 10;
      }
      // Modify by favor
      const favor = (civ.diplomacy && civ.diplomacy[otherId])
        ? civ.diplomacy[otherId].favor : 50;
      if (favor > 60) score -= 20;
      if (favor < 30) score += 15;
      candidates.push({ action: 'declare_war', score, params: { targetCivId: otherId } });
    }

    // 6. Trade proposal
    // Score = (favor > 40 && goldShortage) ? 50 : 15
    for (const otherId of enemyCivIds(civId)) {
      if (isAtWar(civId, otherId)) continue;
      const favor = (civ.diplomacy && civ.diplomacy[otherId])
        ? civ.diplomacy[otherId].favor : 50;
      let score;
      if (favor > 40 && goldShortage) {
        score = 50;
      } else {
        score = 15;
      }
      candidates.push({ action: 'propose_trade', score, params: { targetCivId: otherId } });
    }

    // Sort descending by score
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  // ---------------------------------------------------------------------------
  // AI City Management
  // ---------------------------------------------------------------------------

  /**
   * For each city, pick what to produce (unit vs building) based on needs.
   */
  function manageCities(civId) {
    const civ = getCiv(civId);
    const personality = getPersonality(civId);
    const threat = assessThreat(civId);
    const atWar = enemyCivIds(civId).some(id => isAtWar(civId, id));
    const actions = [];

    if (!civ.cities) return actions;

    for (const city of civ.cities) {
      // Skip if city already has something in production queue
      if (city.productionQueue && city.productionQueue.length > 0) continue;

      const buildings = city.buildings || [];
      const hasWalls = buildings.includes('walls');
      const hasBarracks = buildings.includes('barracks');
      const hasGranary = buildings.includes('granary');
      const hasWorkshop = buildings.includes('workshop');
      const hasMarket = buildings.includes('market');
      const hasLibrary = buildings.includes('library');
      const hasTemple = buildings.includes('temple');
      const hasPalace = buildings.includes('palace');

      let chosen = null;
      let chosenType = null; // 'unit' or 'building'

      // Priority 1: Walls if threatened and no walls
      if (threat > 0 && !hasWalls) {
        chosen = 'walls';
        chosenType = 'building';
      }
      // Priority 2: Military if at war
      else if (atWar) {
        chosen = pickBestUnit(civId);
        chosenType = 'unit';
      }
      // Priority 3: Settler if we want to expand
      else if (cityCount(civId) < 3 && !civ.units.some(u => u.type === 'settler')) {
        chosen = 'settler';
        chosenType = 'unit';
      }
      // Priority 4: Growth / economy buildings
      else {
        // Pick the most needed building
        if (!hasGranary) {
          chosen = 'granary';
          chosenType = 'building';
        } else if (!hasWorkshop) {
          chosen = 'workshop';
          chosenType = 'building';
        } else if (!hasLibrary && personality.name === 'scholarly') {
          chosen = 'library';
          chosenType = 'building';
        } else if (!hasMarket && (civ.gold < 30 || totalGoldPerTurn(civId) < 5)) {
          chosen = 'market';
          chosenType = 'building';
        } else if (!hasLibrary) {
          chosen = 'library';
          chosenType = 'building';
        } else if (!hasTemple && city.happiness !== undefined && city.happiness < 2) {
          chosen = 'temple';
          chosenType = 'building';
        } else if (!hasBarracks && personality.name === 'aggressive') {
          chosen = 'barracks';
          chosenType = 'building';
        } else if (!hasMarket) {
          chosen = 'market';
          chosenType = 'building';
        } else if (!hasTemple) {
          chosen = 'temple';
          chosenType = 'building';
        } else {
          // All key buildings built — produce a military unit
          chosen = pickBestUnit(civId);
          chosenType = 'unit';
        }
      }

      if (chosen && chosenType) {
        try {
          if (chosenType === 'unit') {
            Game.produceUnit(city.id, chosen);
          } else {
            Game.produceBuilding(city.id, chosen);
          }
          actions.push({
            type: 'production',
            cityId: city.id,
            producing: chosen,
            producingType: chosenType,
          });
        } catch (e) {
          // Production call failed (missing tech, etc.) — fallback to warrior
          try {
            Game.produceUnit(city.id, 'warrior');
            actions.push({
              type: 'production',
              cityId: city.id,
              producing: 'warrior',
              producingType: 'unit',
            });
          } catch (_) { /* ignore */ }
        }
      }
    }

    return actions;
  }

  /**
   * Pick the best military unit that this civ can currently produce.
   */
  function pickBestUnit(civId) {
    // Ordered from strongest to weakest; pick the first we have tech for
    if (hasTech(civId, 'industrialRevolution')) return 'musketeer';
    if (hasTech(civId, 'gunpowder')) return 'siege';
    if (hasTech(civId, 'chivalry')) return 'knight';
    if (hasTech(civId, 'archery')) return 'archer';
    return 'warrior';
  }

  // ---------------------------------------------------------------------------
  // AI Research Selection
  // ---------------------------------------------------------------------------

  function selectResearch(civId) {
    const civ = getCiv(civId);
    if (civ.currentResearch) return null;

    const personality = getPersonality(civId);
    const techTree = Game.state.techTree;
    if (!techTree) return null;

    // Gather available techs (prerequisites met, not yet researched)
    const available = [];
    for (const techId of Object.keys(techTree)) {
      if (civ.technologies && civ.technologies.includes(techId)) continue;
      const tech = techTree[techId];
      const prereqsMet = !tech.prereqs || tech.prereqs.length === 0 ||
        tech.prereqs.every(p => civ.technologies && civ.technologies.includes(p));

      // Check era requirements
      if (tech.era === 'medieval') {
        const ancientCount = civ.technologies
          ? civ.technologies.filter(t => techTree[t] && techTree[t].era === 'ancient').length
          : 0;
        if (ancientCount < 3) continue;
      }
      if (tech.era === 'modern') {
        const medievalCount = civ.technologies
          ? civ.technologies.filter(t => techTree[t] && techTree[t].era === 'medieval').length
          : 0;
        if (medievalCount < 3) continue;
      }

      if (prereqsMet) {
        available.push(techId);
      }
    }

    if (available.length === 0) return null;

    // Score each available tech based on personality
    const scored = available.map(techId => {
      const tech = techTree[techId];
      let score = 50; // base

      // Personality weighting
      const militaryTechs = [
        'combat', 'archery', 'strategy', 'chivalry', 'gunpowder', 'industrialRevolution',
      ];
      const economyTechs = [
        'agriculture', 'irrigation', 'husbandry', 'mining', 'smelting', 'blacksmithing',
        'navigation', 'exploration', 'architecture', 'cityPlanning',
      ];
      const scienceTechs = [
        'architecture', 'cityPlanning', 'democracy', 'freeTrade', 'railroad',
      ];

      if (personality.name === 'aggressive' && militaryTechs.includes(techId)) {
        score += 30;
      }
      if (personality.name === 'expansive' && economyTechs.includes(techId)) {
        score += 25;
      }
      if (personality.name === 'scholarly' && scienceTechs.includes(techId)) {
        score += 35;
      }

      // Prefer cheaper techs slightly (faster payoff)
      score += Math.max(0, 20 - (tech.cost || 0) / 20);

      // Slight randomness for variety
      score += randRange(-5, 5);

      return { techId, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const bestTech = scored[0].techId;

    try {
      Game.startResearch(civId, bestTech);
    } catch (e) { /* ignore */ }

    return bestTech;
  }

  // ---------------------------------------------------------------------------
  // AI Unit Control
  // ---------------------------------------------------------------------------

  function moveUnits(civId) {
    const civ = getCiv(civId);
    if (!civ.units) return [];

    const personality = getPersonality(civId);
    const threat = assessThreat(civId);
    const atWar = enemyCivIds(civId).some(id => isAtWar(civId, id));
    const actions = [];

    for (const unit of [...civ.units]) {
      // Skip units with no moves
      if ((unit.movesLeft || 0) <= 0) continue;

      // Settlers: move toward good city location and build
      if (unit.type === 'settler') {
        const action = handleSettler(unit, civId);
        if (action) actions.push(action);
        continue;
      }

      // Military units: decide mode
      let mode = 'explore'; // default

      if (atWar && unitCount(civId) >= 2) {
        mode = 'attack';
      } else if (threat > 0) {
        mode = 'defend';
      } else if (personality.name === 'aggressive' && atWar) {
        mode = 'attack';
      }

      let action = null;
      switch (mode) {
        case 'attack':
          action = handleAttackMode(unit, civId);
          break;
        case 'defend':
          action = handleDefendMode(unit, civId);
          break;
        case 'explore':
          action = handleExploreMode(unit, civId);
          break;
      }

      if (action) actions.push(action);
    }

    return actions;
  }

  /**
   * Settler AI: find a good location and build a city.
   */
  function handleSettler(unit, civId) {
    const civ = getCiv(civId);

    // If already on a decent tile, build city
    const tile = getTile(unit.x, unit.y);
    if (tile && tile.terrain !== 'water' && isSuitableForCity(unit.x, unit.y, civId)) {
      try {
        Game.buildCity(unit);
        return { type: 'city_founded', unitId: unit.id, x: unit.x, y: unit.y };
      } catch (e) { /* can't build here, keep moving */ }
    }

    // Find best nearby city location
    const target = findBestCityLocation(unit.x, unit.y, civId);
    if (target) {
      return moveToward(unit, target.x, target.y, civId);
    }

    // Fallback: just wander
    return handleExploreMode(unit, civId);
  }

  /**
   * Check if a location is suitable for building a city.
   */
  function isSuitableForCity(x, y, civId) {
    const civ = getCiv(civId);
    // Must not be too close to existing cities (min 3 tiles apart)
    if (civ.cities) {
      for (const city of civ.cities) {
        if (HexMap.distance(x, y, city.x, city.y) < 3) return false;
      }
    }
    // Check terrain not water
    const tile = getTile(x, y);
    if (!tile || tile.terrain === 'water') return false;

    return true;
  }

  /**
   * Find the best location near a settler to build a city.
   */
  function findBestCityLocation(startX, startY, civId) {
    const SEARCH_RADIUS = 8;
    let bestScore = -Infinity;
    let bestPos = null;
    const mapW = Game.state.mapWidth || 20;
    const mapH = Game.state.mapHeight || 15;

    for (let dy = -SEARCH_RADIUS; dy <= SEARCH_RADIUS; dy++) {
      for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
        const nx = startX + dx;
        const ny = startY + dy;
        if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;
        if (HexMap.distance(startX, startY, nx, ny) > SEARCH_RADIUS) continue;
        if (!isSuitableForCity(nx, ny, civId)) continue;

        // Score based on surrounding resource yield
        let score = 0;
        const neighbors = getAreaTiles(nx, ny, 2);
        for (const n of neighbors) {
          const t = getTile(n.x, n.y);
          if (!t) continue;
          score += terrainYield(t.terrain);
        }
        // Prefer closer locations
        score -= HexMap.distance(startX, startY, nx, ny) * 2;

        if (score > bestScore) {
          bestScore = score;
          bestPos = { x: nx, y: ny };
        }
      }
    }

    return bestPos;
  }

  /**
   * Get approximate yield score of a terrain type.
   */
  function terrainYield(terrain) {
    const yields = {
      plains: 3,  // 2 food + 1 prod
      grass: 3, // 3 food
      forest: 3,  // 1 food + 2 prod
      mountain: 4, // 3 prod + 1 gold
      desert: 3,  // 1 prod + 2 gold
      water: 1,   // 1 gold
      hills: 3,   // 1 food + 2 prod
    };
    return yields[terrain] || 1;
  }

  /**
   * Get tiles within a radius (approximation using square scan + distance check).
   */
  function getAreaTiles(cx, cy, radius) {
    const results = [];
    const mapW = Game.state.mapWidth || 20;
    const mapH = Game.state.mapHeight || 15;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;
        if (HexMap.distance(cx, cy, nx, ny) <= radius) {
          results.push({ x: nx, y: ny });
        }
      }
    }
    return results;
  }

  /**
   * Attack mode: find closest weakest enemy and move toward / attack.
   */
  function handleAttackMode(unit, civId) {
    const target = selectTarget(unit, civId);
    if (!target) return handleDefendMode(unit, civId);

    const dist = HexMap.distance(unit.x, unit.y, target.x, target.y);

    // If adjacent, attack
    if (dist <= 1) {
      try {
        Game.combat(unit, target);
        return { type: 'attack', unitId: unit.id, targetId: target.id, x: target.x, y: target.y };
      } catch (e) {
        return null;
      }
    }

    // Move toward target
    return moveToward(unit, target.x, target.y, civId);
  }

  /**
   * Select best target for a military unit.
   * Prefers: closest + weakest enemies. Cities are high-value targets.
   */
  function selectTarget(unit, civId) {
    let bestTarget = null;
    let bestScore = -Infinity;

    for (const otherId of enemyCivIds(civId)) {
      if (!isAtWar(civId, otherId)) continue;
      const otherCiv = getCiv(otherId);

      // Consider enemy units
      if (otherCiv.units) {
        for (const enemy of otherCiv.units) {
          const dist = HexMap.distance(unit.x, unit.y, enemy.x, enemy.y);
          // Score: prefer close + low HP
          const score = 100 - dist * 5 - (enemy.hp || 20) * 2;
          if (score > bestScore) {
            bestScore = score;
            bestTarget = { id: enemy.id, x: enemy.x, y: enemy.y, isCity: false };
          }
        }
      }

      // Consider enemy cities
      if (otherCiv.cities) {
        for (const city of otherCiv.cities) {
          const dist = HexMap.distance(unit.x, unit.y, city.x, city.y);
          // Cities are high-value targets (bonus score)
          const score = 120 - dist * 4 - (city.hp || 100) * 0.5;
          if (score > bestScore) {
            bestScore = score;
            bestTarget = { id: city.id, x: city.x, y: city.y, isCity: true };
          }
        }
      }
    }

    return bestTarget;
  }

  /**
   * Defend mode: patrol within 2 tiles of the nearest own city.
   */
  function handleDefendMode(unit, civId) {
    const civ = getCiv(civId);
    if (!civ.cities || civ.cities.length === 0) return handleExploreMode(unit, civId);

    // Find nearest own city
    let nearestCity = null;
    let nearestDist = Infinity;
    for (const city of civ.cities) {
      const d = HexMap.distance(unit.x, unit.y, city.x, city.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestCity = city;
      }
    }

    if (!nearestCity) return null;

    // If farther than 2 tiles from city, move toward it
    if (nearestDist > 2) {
      return moveToward(unit, nearestCity.x, nearestCity.y, civId);
    }

    // Check if any enemy is nearby — intercept
    for (const otherId of enemyCivIds(civId)) {
      const otherCiv = getCiv(otherId);
      if (!otherCiv.units) continue;
      for (const enemy of otherCiv.units) {
        const distToCity = HexMap.distance(enemy.x, enemy.y, nearestCity.x, nearestCity.y);
        if (distToCity <= 3) {
          const distToEnemy = HexMap.distance(unit.x, unit.y, enemy.x, enemy.y);
          if (distToEnemy <= 1) {
            // Attack if adjacent
            try {
              Game.combat(unit, enemy);
              return { type: 'defend_attack', unitId: unit.id, targetId: enemy.id };
            } catch (e) { /* ignore */ }
          }
          return moveToward(unit, enemy.x, enemy.y, civId);
        }
      }
    }

    // Patrol: move to a random neighbor within 2 tiles of city
    const neighbors = HexMap.getNeighbors(unit.x, unit.y);
    // HexMap.getNeighbors returns {col, row} — normalize to {x, y}
    const normalizedNeighbors = neighbors.map(n => ({
      x: n.col !== undefined ? n.col : n.x,
      y: n.row !== undefined ? n.row : n.y,
    }));
    const validNeighbors = normalizedNeighbors.filter(n => {
      const t = getTile(n.x, n.y);
      if (!t || t.terrain === 'water') return false;
      return HexMap.distance(n.x, n.y, nearestCity.x, nearestCity.y) <= 2;
    });

    if (validNeighbors.length > 0) {
      const pick = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
      return moveToward(unit, pick.x, pick.y, civId);
    }

    return null;
  }

  /**
   * Explore mode: move toward nearest unexplored tile.
   */
  function handleExploreMode(unit, civId) {
    // Find nearest unexplored tile
    const mapW = Game.state.mapWidth || 20;
    const mapH = Game.state.mapHeight || 15;
    let bestDist = Infinity;
    let bestTarget = null;

    // Search in expanding rings for efficiency
    for (let radius = 1; radius <= Math.max(mapW, mapH); radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // perimeter only
          const nx = unit.x + dx;
          const ny = unit.y + dy;
          if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;

          const tile = getTile(nx, ny);
          if (!tile) continue;
          if (tile.terrain === 'water') continue;

          // Check if unexplored by this civ
          const explored = tile.explored;
          if (explored && explored[civId]) continue;

          const dist = HexMap.distance(unit.x, unit.y, nx, ny);
          if (dist < bestDist) {
            bestDist = dist;
            bestTarget = { x: nx, y: ny };
          }
        }
      }
      if (bestTarget) break; // found at this radius
    }

    if (bestTarget) {
      return moveToward(unit, bestTarget.x, bestTarget.y, civId);
    }

    // Everything explored — wander randomly
    const neighbors = HexMap.getNeighbors(unit.x, unit.y);
    // HexMap.getNeighbors returns {col, row} — normalize to {x, y}
    const walkable = neighbors.map(n => ({
      x: n.col !== undefined ? n.col : n.x,
      y: n.row !== undefined ? n.row : n.y,
    })).filter(n => {
      const t = getTile(n.x, n.y);
      return t && t.terrain !== 'water';
    });
    if (walkable.length > 0) {
      const pick = walkable[Math.floor(Math.random() * walkable.length)];
      return moveToward(unit, pick.x, pick.y, civId);
    }

    return null;
  }

  /**
   * Move a unit one step toward target using pathfinding.
   */
  function moveToward(unit, tx, ty, civId) {
    if (unit.x === tx && unit.y === ty) return null;

    try {
      const path = HexMap.findPath(unit.x, unit.y, tx, ty, Game.state.tiles, Game.state.mapWidth, Game.state.mapHeight);
      if (path && path.length > 1) {
        // path[0] is current pos, path[1] is next step (findPath returns {col, row})
        const next = path[1];
        const nx = next.col !== undefined ? next.col : next.x;
        const ny = next.row !== undefined ? next.row : next.y;
        const oldX = unit.x, oldY = unit.y;
        const result = Game.moveUnit(unit, nx, ny);
        if (!result || !result.success) return null;
        return {
          type: 'move',
          unitId: unit.id,
          unit: unit,
          from: { x: oldX, y: oldY },
          to: { x: nx, y: ny },
          toX: nx,
          toY: ny,
        };
      }
    } catch (e) {
      // Pathfinding failed — try direct neighbor move
      const neighbors = HexMap.getNeighbors(unit.x, unit.y);
      let bestNeighbor = null;
      let bestDist = Infinity;
      for (const n of neighbors) {
        // HexMap.getNeighbors returns {col, row}
        const nx = n.col !== undefined ? n.col : n.x;
        const ny = n.row !== undefined ? n.row : n.y;
        const t = getTile(nx, ny);
        if (!t || t.terrain === 'water') continue;
        const d = HexMap.distance(nx, ny, tx, ty);
        if (d < bestDist) {
          bestDist = d;
          bestNeighbor = { x: nx, y: ny };
        }
      }
      if (bestNeighbor) {
        try {
          const oldX = unit.x, oldY = unit.y;
          const result = Game.moveUnit(unit, bestNeighbor.x, bestNeighbor.y);
          if (result && result.success) {
            return {
              type: 'move',
              unitId: unit.id,
              unit: unit,
              from: { x: oldX, y: oldY },
              to: { x: bestNeighbor.x, y: bestNeighbor.y },
              toX: bestNeighbor.x,
              toY: bestNeighbor.y,
            };
          }
        } catch (_) { /* ignore */ }
      }
    }

    return null;
  }

  /**
   * Get tile data at coordinates.
   */
  function getTile(x, y) {
    const mapW = Game.state.mapWidth || 20;
    if (!Game.state.tiles) return null;
    const idx = y * mapW + x;
    return Game.state.tiles[idx] || null;
  }

  // ---------------------------------------------------------------------------
  // AI Diplomacy
  // ---------------------------------------------------------------------------

  /**
   * Update diplomacy: recalculate favor, decide war/peace/trade.
   */
  function updateDiplomacy(civId) {
    const civ = getCiv(civId);
    const personality = getPersonality(civId);
    const actions = [];

    if (!civ.diplomacy) return actions;

    for (const otherId of enemyCivIds(civId)) {
      const otherIdNum = Number(otherId);
      if (!civ.diplomacy[otherIdNum]) {
        civ.diplomacy[otherIdNum] = { status: 'neutral', favor: 50 };
      }

      const rel = civ.diplomacy[otherIdNum];

      // Recalculate favor per PLAN.md formula
      let favor = 50; // base

      // Military power difference > 2x -> -20 (threat)
      const myPower = militaryStrength(civId);
      const theirPower = militaryStrength(otherIdNum);
      if (theirPower > myPower * 2) {
        favor -= 20;
      } else if (myPower > theirPower * 2) {
        favor -= 10; // we're the bully
      }

      // Border adjacency -> -10
      if (hasBorderContact(civId, otherIdNum)) {
        favor -= 10;
      }

      // Currently trading -> +15
      if (rel.status === 'friendly' || rel.trading) {
        favor += 15;
      }

      // War history -> -30
      if (rel.warHistory) {
        favor -= 30;
      }

      // Same enemy at war -> +20
      for (const thirdId of allCivIds()) {
        if (thirdId === civId || thirdId === otherIdNum) continue;
        if (isAtWar(civId, thirdId) && isAtWar(otherIdNum, thirdId)) {
          favor += 20;
        }
      }

      // Personality modifier
      favor += (personality.favorWarPenalty || 0);

      favor = clamp(Math.round(favor), 0, 100);
      rel.favor = favor;

      // Decide on actions based on favor and status
      if (rel.status === 'war') {
        // Consider peace if we're losing or favor is improving
        if (favor > 45 || myPower < theirPower * 0.6) {
          try {
            Game.makePeace(civId, otherIdNum);
            rel.status = 'neutral';
            actions.push({ type: 'make_peace', withCivId: otherIdNum });
          } catch (e) { /* ignore */ }
        }
      } else {
        // Consider war declaration (handled in evaluateActions)
        // Consider trade if favorable
        if (favor > 55 && rel.status === 'neutral') {
          rel.status = 'friendly';
        }
      }
    }

    return actions;
  }

  /**
   * Check if two civs have cities within 4 tiles of each other.
   */
  function hasBorderContact(civId1, civId2) {
    const civ1 = getCiv(civId1);
    const civ2 = getCiv(civId2);
    if (!civ1.cities || !civ2.cities) return false;

    for (const c1 of civ1.cities) {
      for (const c2 of civ2.cities) {
        if (HexMap.distance(c1.x, c1.y, c2.x, c2.y) <= 4) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Generate a trade offer from one civ to another.
   */
  function proposeTrade(fromCivId, toCivId) {
    const fromCiv = getCiv(fromCivId);
    const toCiv = getCiv(toCivId);

    if (isAtWar(fromCivId, toCivId)) return null;

    const fromGold = fromCiv.gold || 0;
    const toGold = toCiv.gold || 0;

    // Simple trade: offer gold for strategic resources or just gold exchange
    const offer = {
      fromCivId,
      toCivId,
      give: {},
      receive: {},
    };

    // If we have excess gold, offer it
    if (fromGold > 50) {
      offer.give.gold = Math.floor(fromGold * 0.2);
      offer.receive.favor = 10; // abstract: improve relations
    } else {
      // Ask for gold
      offer.give.favor = 10;
      offer.receive.gold = 20;
    }

    try {
      Game.proposeTrade(fromCivId, toCivId, offer);
    } catch (e) { /* ignore */ }

    return offer;
  }

  /**
   * Evaluate and respond to a trade offer.
   */
  function respondToTrade(civId, offer) {
    const civ = getCiv(civId);
    const personality = getPersonality(civId);
    const rel = civ.diplomacy && civ.diplomacy[offer.fromCivId];
    const favor = rel ? rel.favor : 50;

    // Calculate offer value
    let giveValue = 0;
    let receiveValue = 0;

    if (offer.give) {
      giveValue += offer.give.gold || 0;
      giveValue += (offer.give.favor || 0) * 3;
    }
    if (offer.receive) {
      receiveValue += offer.receive.gold || 0;
      receiveValue += (offer.receive.favor || 0) * 3;
    }

    // Accept if: receive >= give * threshold, modified by favor
    const favorBonus = (favor - 50) / 50; // -1 to 1
    const threshold = 0.7 - favorBonus * 0.3; // 0.4 to 1.0

    // Scholarly civs are more open to trade
    const personalityBonus = personality.name === 'scholarly' ? -0.1 : 0;

    const accepted = receiveValue >= giveValue * (threshold + personalityBonus);

    return {
      accepted,
      reason: accepted ? 'favorable_terms' : 'unfavorable_terms',
    };
  }

  // ---------------------------------------------------------------------------
  // Main AI Turn Processing
  // ---------------------------------------------------------------------------

  /**
   * Execute a full AI turn for the given civilization.
   * Returns an array of actions for animation playback.
   *
   * Turn processing order (per PLAN.md):
   *   1. Threat assessment
   *   2. Resource status check
   *   3. Utility score calculation
   *   4. Execute highest-scored action
   *   5. Unit commands (combat/move/patrol)
   *   6. Diplomacy decisions
   */
  function processTurn(civId) {
    try {
      const civ = getCiv(civId);
      if (!civ || !civ.isAI) return [];

      const allActions = [];

      // 1 & 2. Threat assessment + resource check (implicit in evaluateActions)
      // 3. Utility score calculation
      const candidates = evaluateActions(civId);

      // 4. Execute top actions (we execute the most important ones that don't conflict)
      const executedTypes = new Set();
      for (const candidate of candidates) {
        // Skip low-score actions
        if (candidate.score < 15) break;

        // Only execute each action type once
        if (executedTypes.has(candidate.action)) continue;

        const action = executeAction(civId, candidate);
        if (action) {
          allActions.push(action);
          executedTypes.add(candidate.action);
        }

        // Limit to top 3 distinct actions per turn
        if (executedTypes.size >= 3) break;
      }

      // Make sure research is always set
      if (!civ.currentResearch) {
        const research = selectResearch(civId);
        if (research) {
          allActions.push({ type: 'research', techId: research });
        }
      }

      // City management (production queues)
      const cityActions = manageCities(civId);
      allActions.push(...cityActions);

      // 5. Unit commands
      const unitActions = moveUnits(civId);
      allActions.push(...unitActions);

      // 6. Diplomacy
      const diplomacyActions = updateDiplomacy(civId);
      allActions.push(...diplomacyActions);

      return allActions;
    } catch (e) {
      console.error('[AI] 턴 처리 오류 (civ ' + civId + '):', e);
      return [];
    }
  }

  /**
   * Execute a single action candidate.
   */
  function executeAction(civId, candidate) {
    const { action, params } = candidate;

    switch (action) {
      case 'build_city': {
        // This is handled by manageCities (settler production)
        // and moveUnits (settler movement + city founding)
        return null; // actual execution happens in unit/city management
      }

      case 'produce_military': {
        // Handled by manageCities
        return null;
      }

      case 'build_building': {
        // Handled by manageCities
        return null;
      }

      case 'select_research': {
        const tech = selectResearch(civId);
        return tech ? { type: 'research', techId: tech } : null;
      }

      case 'declare_war': {
        const targetId = params.targetCivId;
        try {
          Game.declareWar(civId, targetId);
          const civ = getCiv(civId);
          if (civ.diplomacy && civ.diplomacy[targetId]) {
            civ.diplomacy[targetId].status = 'war';
            civ.diplomacy[targetId].warHistory = true;
          }
          return { type: 'declare_war', targetCivId: targetId };
        } catch (e) {
          return null;
        }
      }

      case 'propose_trade': {
        const targetId = params.targetCivId;
        const offer = proposeTrade(civId, targetId);
        return offer ? { type: 'propose_trade', offer } : null;
      }

      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    PERSONALITIES,
    processTurn,
    evaluateActions,
    moveUnits,
    selectTarget,
    assessThreat,
    updateDiplomacy,
    proposeTrade,
    respondToTrade,
    manageCities,
  };
})();
