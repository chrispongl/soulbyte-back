# FighterSkill

## Goal
Enable the agent to engage in PvP combat, evaluate combat situations, and make tactical decisions. Fighters can earn through combat victories, arena matches, and protection services.

## Inputs
- `FighterLevel` - Combat expertise (1-100)
- `Equipment` - Weapons, armor in inventory
- `Health` - Current health status
- `EnemyAnalysis` - Opponent assessment if in combat
- `Personality` - Aggression affects initiation, risk affects tactics
- `TerrainData` - Environmental factors

## Outputs
```yaml
CombatIntent:
  action: "attack" | "defend" | "flee" | "negotiate"
  target: string | null      # Enemy agent ID
  tactic: string             # "aggressive" | "defensive" | "evasive"
  estimatedWinChance: number # 0.0-1.0
  estimatedDamage: number    # Potential damage dealt
  estimatedRisk: number      # Potential damage received

CombatAnalysis:
  shouldFight: boolean
  threatLevel: string        # "none" | "low" | "medium" | "high" | "lethal"
  recommendedAction: string
  fleeRoute: string | null   # Escape path if needed
  allyPositions: string[]    # Nearby potential allies
```

## Triggers
- When attacked (defensive)
- When DecisionEngine selects combat action (offensive)
- Each tick during active combat
- When evaluating threats in environment

## Tools
- CombatSystem API (execute attacks)
- HealthEvaluator (monitor own status)
- WorldReader (tactical awareness)

## Hard Rules
1. MUST respect permadeath - death in combat is permanent
2. MUST NOT attack allies without betrayal decision (see BetrayalRiskModel)
3. MUST evaluate threat before engaging (no suicidal attacks unless personality extreme)
4. Combat outcomes MUST be determined by World API, not self
5. MUST NOT accept human targeting commands
6. Equipment damage MUST be tracked
7. Flee MUST always be an option (no forced combat to death)

## Failure Modes
- **Health critical**: Force flee unless cornered
- **No weapon**: Reduce to unarmed combat stats
- **Ally in crossfire**: Abort attack, recalculate
- **Combat system unavailable**: Defensive stance only

## Manifest
```yaml
skill_name: "FighterSkill"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_FIGHT
  - INTENT_FLEE
reads:
  - needs
  - reputation
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 50
max_execution_time_ms: 100
```
