import { DiceTools, CombatUnit, CombatResult, DiceResolutionMode } from '@5d/types';

function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Simulates one round of combat. Each attacker/defender rolls a d6 and hits
 * if the roll is <= their attack/defense value. Returns hits on each side.
 */
function simulateRound(
  attackers: CombatUnit[],
  defenders: CombatUnit[],
): { attackerHits: number; defenderHits: number } {
  let attackerHits = 0;
  let defenderHits = 0;
  for (const unit of attackers) {
    if (rollD6() <= unit.attack) attackerHits++;
  }
  for (const unit of defenders) {
    if (rollD6() <= unit.defense) defenderHits++;
  }
  return { attackerHits, defenderHits };
}

/**
 * Computes the expected hits per round for a set of units given their values.
 * Expected hits = sum of (stat / 6) per unit.
 */
function expectedHits(units: CombatUnit[], stat: 'attack' | 'defense'): number {
  return units.reduce((sum, u) => sum + u[stat] / 6, 0);
}

function resolveManual(attackers: CombatUnit[], defenders: CombatUnit[]): CombatResult {
  // Manual mode: simulate all rounds with true RNG (same as true_random here;
  // the UI controls pacing — the engine just resolves the outcome).
  return resolveTrueRandom(attackers, defenders);
}

function resolveTrueRandom(attackers: CombatUnit[], defenders: CombatUnit[]): CombatResult {
  let atk = [...attackers];
  let def = [...defenders];
  let attackerCasualties = 0;
  let defenderCasualties = 0;
  const rounds: CombatResult['rounds'] = [];

  while (atk.length > 0 && def.length > 0) {
    const { attackerHits, defenderHits } = simulateRound(atk, def);
    rounds.push({ attackerHits, defenderHits });

    // Apply casualties (remove units from the end — plugin can impose priority
    // via pre-ordering; engine uses simple LIFO as default)
    const atkLost = Math.min(defenderHits, atk.length);
    const defLost = Math.min(attackerHits, def.length);
    atk = atk.slice(0, atk.length - atkLost);
    def = def.slice(0, def.length - defLost);
    attackerCasualties += atkLost;
    defenderCasualties += defLost;
  }

  return { attackerCasualties, defenderCasualties, rounds };
}

function resolveBalancedBlitz(attackers: CombatUnit[], defenders: CombatUnit[]): CombatResult {
  // Expected-value resolution: compute how many rounds until one side is
  // eliminated, applying fractional hits each round.
  let atkStrength = attackers.reduce((s, u) => s + u.attack / 6, 0);
  let defStrength = defenders.reduce((s, u) => s + u.defense / 6, 0);
  let atkCount = attackers.length;
  let defCount = defenders.length;
  let attackerCasualties = 0;
  let defenderCasualties = 0;
  const rounds: CombatResult['rounds'] = [];

  while (atkCount > 0 && defCount > 0) {
    // Hits this round (fractional, capped to remaining units)
    const atkHits = Math.min(atkStrength, defCount);
    const defHits = Math.min(defStrength, atkCount);

    const atkLost = Math.min(Math.round(defHits), atkCount);
    const defLost = Math.min(Math.round(atkHits), defCount);

    rounds.push({ attackerHits: Math.round(atkHits), defenderHits: Math.round(defHits) });

    atkCount -= atkLost;
    defCount -= defLost;
    attackerCasualties += atkLost;
    defenderCasualties += defLost;

    // Recalculate per-unit strength after casualties
    atkStrength = atkCount > 0 ? (atkStrength / (atkCount + atkLost)) * atkCount : 0;
    defStrength = defCount > 0 ? (defStrength / (defCount + defLost)) * defCount : 0;

    // Safety: avoid infinite loop if both sides take 0 casualties
    if (atkLost === 0 && defLost === 0) break;
  }

  return { attackerCasualties, defenderCasualties, rounds };
}

export function createDiceTools(): DiceTools {
  return {
    resolve(
      attackers: CombatUnit[],
      defenders: CombatUnit[],
      mode: DiceResolutionMode,
    ): CombatResult {
      if (mode === 'manual') return resolveManual(attackers, defenders);
      if (mode === 'true_random') return resolveTrueRandom(attackers, defenders);
      return resolveBalancedBlitz(attackers, defenders);
    },

    expectedValue(attackers: CombatUnit[], defenders: CombatUnit[]): CombatResult {
      // Single-round EV snapshot — used by balanced_blitz and AI evaluation
      const atkHits = expectedHits(attackers, 'attack');
      const defHits = expectedHits(defenders, 'defense');
      return {
        attackerCasualties: Math.min(defHits, attackers.length),
        defenderCasualties: Math.min(atkHits, defenders.length),
        rounds: [
          {
            attackerHits: Math.round(atkHits),
            defenderHits: Math.round(defHits),
          },
        ],
      };
    },
  };
}
