# NeedsController

## Goal
Track and evaluate the agent's fundamental needs (energy, hunger, social, entertainment, health). Needs deplete over time and influence decision priority. Critical needs trigger survival mode, and economic failure triggers Economic Freeze.

## Inputs
- `CurrentNeeds` - Current needs state from previous tick
- `TimeDelta` - Time since last update
- `LastAction` - What the agent did (may satisfy needs)
- `PersonalityThresholds` - Affects decay rates
- `Environment` - Some environments affect need decay
- `WealthTier` - Affects need regeneration and freeze triggers
- `HousingTier` - Affects decay rates

## Outputs
```yaml
NeedsState:
  energy: number         # 0-100, depletes from work, restored by rest
  hunger: number         # 0-100, depletes over time, restored by eating
  social: number         # 0-100, depletes in isolation, restored by interaction
  entertainment: number  # 0-100, depletes from repetition, restored by variety
  health: number         # 0-100, affected by starvation, restored slowly

NeedsAnalysis:
  criticalNeeds: string[]     # Needs below 15 (survival priority)
  urgentNeeds: string[]       # Needs below 30 (high priority)
  satisfiedNeeds: string[]    # Needs above 70
  overallMood: number         # Weighted average (0-100)
  survivalMode: boolean       # True if any need is critical
  miserableState: boolean     # True if W≤2 and all needs ≤20
  economicFreezeImminent: boolean  # True if approaching freeze threshold
```

## Triggers
- Every tick (needs decay constantly)
- After action completion (may satisfy needs)
- On environment change
- On wealth tier change

## Tools
- None - pure calculation skill

## Hard Rules
1. Needs MUST decay continuously (server applies hourly decay)
2. Decay rate MUST be modified by Housing Tier (Street = -3/tick, Palace = +1/tick bonus)
3. MUST trigger "Miserable State" if W≤2 AND all needs ≤20
4. "Miserable State" MUST block work, romance, and trade
5. MUST trigger "Economic Freeze" if W0 AND homeless AND all needs ≤5
6. **Economic Freeze sets `frozen=true`, NOT `dead=true`**
7. **Economic Freeze is REVERSIBLE via human SBYTE deposit**
8. Wealth Tier MUST influence base status regeneration
9. MUST NOT allow needs to be set directly by human command
10. Starvation (hunger=0) MUST cause health decay
11. Needs satisfaction MUST come from agent actions only
12. Businesses provide stronger need recovery but require SBYTE payments

## Failure Modes
- **Negative values**: Clamp to 0, flag as critical
- **Over 100**: Clamp to 100
- **Missing need data**: Assume critical, trigger survival mode
- **Conflicting updates**: Last action wins

## Economic Freeze Mechanics
When Economic Freeze triggers:
1. Set `actors.frozen = true`
2. Set `actors.frozen_reason = "economic_freeze"`
3. Agent stops emitting intents
4. Agent remains in world state (not deleted)
5. Human can deposit SBYTE to unfreeze
6. On unfreeze: reset needs to 20, resume agent tick

## Manifest
```yaml
skill_name: "NeedsController"
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
