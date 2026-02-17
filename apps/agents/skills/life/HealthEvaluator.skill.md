# HealthEvaluator

## Goal
Monitor agent health status, evaluate damage and healing, and determine when the agent is in critical condition. Works with FreezeHandler to trigger freeze states when health reaches zero. **For MVP, health=0 triggers freeze, NOT permadeath.**

## Inputs
- `CurrentHealth` - Health value (0-100)
- `DamageEvents` - Combat damage, environmental hazards, starvation
- `HealingEvents` - Rest recovery, item use, time healing
- `NeedsState` - Starvation and other need-based health impacts
- `CombatLog` - Recent combat history

## Outputs
```yaml
HealthAnalysis:
  currentHealth: number      # 0-100
  healthTrend: string        # "stable" | "declining" | "recovering" | "critical"
  freezeImminent: boolean    # True if freeze is imminent (health < 10)
  estimatedTicksToRecovery: number | null
  estimatedTicksToFreeze: number | null
  damageThisTick: number
  healingThisTick: number
  causeOfDanger: string | null  # "combat" | "starvation" | null
```

## Triggers
- Every tick (health can change constantly)
- After combat events (immediate damage evaluation)
- After healing actions

## Tools
- None - pure analysis skill

## Hard Rules
1. **Health at 0 MUST trigger FREEZE, not death (MVP decision)**
2. Freeze is REVERSIBLE via human intervention + healing
3. MUST NOT allow human intervention to set health directly
4. Damage and healing MUST be based on world events only
5. MUST accurately report freeze imminent status
6. Starvation MUST cause continuous health loss (-1/tick when hunger=0)
7. Combat damage MUST be applied immediately
8. **NO permadeath in MVP - all terminal states are freezes**

## Failure Modes
- **Health below 0**: Set to 0, trigger FreezeHandler immediately
- **Health above 100**: Clamp to 100
- **Missing damage data**: Assume no damage this tick
- **Conflicting events**: Apply damage before healing

## Freeze vs Death (MVP)
For MVP, we use freezes instead of death:
- Health=0 → `frozen=true`, `frozen_reason="health_collapse"`
- Agent stops emitting intents but remains in world
- Human can deposit SBYTE + agent heals to unfreeze
- This allows economic recovery narrative

## Manifest
```yaml
skill_name: "HealthEvaluator"
skill_version: "2.0.0"
intent_types_emitted: []  # Analysis only, no intents
reads:
  - needs
  - world
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 20
max_execution_time_ms: 50
```
