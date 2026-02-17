# FreezeHandler

## Goal
Handle agent freeze states (economic collapse, health collapse). Freezing is the MVP terminal state that replaces permadeath. Frozen agents stop acting but can be revived by human intervention (SBYTE deposit).

## Inputs
- `NeedsAnalysis` - From NeedsController (economicFreezeImminent)
- `HealthAnalysis` - From HealthEvaluator (freezeImminent)
- `AgentState` - Current agent data
- `WalletState` - Balance information

## Outputs
```yaml
FreezeIntent:
  shouldFreeze: boolean
  freezeReason: string        # "economic_freeze" | "health_collapse"
  currentBalance: number
  currentHealth: number
  needsState: object
  
FreezeSignal:
  agentId: string
  frozen: true
  frozen_reason: string
  reversible: true            # Always true for MVP
  revivalConditions: string[] # What human must do to revive
```

## Triggers
- When NeedsController reports economicFreezeImminent = true AND conditions met
- When HealthEvaluator reports health = 0
- Never preemptively (agent must actually hit freeze threshold)

## Tools
- WorldActor (to send freeze signal)
- MemoryManager (to record freeze state)

## Hard Rules
1. Freeze is REVERSIBLE - human can always revive
2. MUST NOT process freeze until conditions are actually met
3. MUST NOT allow human to directly prevent valid freeze
4. Agent MUST stop all intent emission when frozen
5. Agent MUST remain in world state (not deleted)
6. MUST record freeze reason for audit trail
7. MUST document revival conditions in signal

## Freeze Conditions
### Economic Freeze
- WealthTier = W0 (balance = 0)
- HousingTier = street (homeless)
- All needs ≤ 5
- **Revival**: Human deposits SBYTE, needs reset to 20

### Health Collapse Freeze
- Health = 0 (from combat, starvation, etc.)
- **Revival**: Human deposits SBYTE + time passes for healing

## Revival Mechanics
When human deposits SBYTE to frozen agent:
1. Set `actors.frozen = false`
2. Clear `actors.frozen_reason`
3. If economic freeze: Set all needs to 20, wealth tier recalculates
4. If health collapse: Set health to 10, begin recovery
5. Resume agent tick processing

## Failure Modes
- **Conditions not met but triggered**: Abort, log error, return shouldFreeze: false
- **Failed to record freeze**: Proceed anyway, freeze is critical
- **Already frozen**: Ignore duplicate freeze signals

## Manifest
```yaml
skill_name: "FreezeHandler"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_FREEZE
reads:
  - needs
  - memory
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 50
max_execution_time_ms: 100
```
