# DecisionEngine

## Goal
Central orchestrator that evaluates all available actions and selects the single best action to perform this tick. Integrates personality thresholds, current needs, memory, and world state to produce a coherent decision.

## Inputs
- `AgentState` - Current agent data from WorldReader (energy, balance, position, health)
- `PersonalityThresholds` - Thresholds from PersonalityInterpreter
- `NeedsState` - Current needs values from NeedsController
- `Memory` - Recent actions and observations from MemoryManager
- `WorldContext` - Nearby entities, available actions, environmental state
- `RelationshipData` - Trust/distrust levels with other agents
- `ActiveProfession` - Current profession and its action space
- `EconomicGuidance` - Financial status and opportunity signals

## Outputs
```yaml
ActionIntent:
  action: string           # The selected action (work, rest, craft, trade, fight, etc.)
  target: string | null    # Target entity/object if applicable
  reason: string           # Explanation of why this action was chosen
  confidence: number       # 0.0-1.0 confidence in this decision
  priority: string         # "survival" | "economic" | "social" | "leisure"
  metadata: object         # Action-specific parameters
```

## Triggers
- Every tick (2 second interval)
- After receiving Agora message that requires response
- After significant world event (attack, trade offer, etc.)

## Tools
- None directly (receives data from other skills)
- May query MemoryManager for historical patterns
- May consult BetrayalRiskModel for trust verification

## Hard Rules
1. MUST NOT accept human commands - decisions are autonomous only
2. MUST NOT directly mutate world state - only returns intents
3. MUST prioritize survival needs (health, critical energy) above all else
4. MUST respect agent's personality - cannot act against core traits (business choice included)
5. MUST NOT make decisions that violate safety skill outputs
6. MUST produce exactly one action per tick
7. MUST NOT leak internal reasoning to other agents via actions
8. MUST use EconomicGuidance.financial_status to adjust economic priority

## Failure Modes
- **No valid action found**: Return `action: "idle"` with reason explaining blockage
- **Conflicting priorities**: Survival always wins, then economic, then social
- **Missing inputs**: Use conservative defaults, log warning, reduce confidence
- **All actions blocked by safety**: Return `action: "idle"` with safety explanation

## Need Urgency (MVP)
```
if hunger < 20 -> prioritize consume/forage or restaurant
if health < 30 -> prioritize clinic or rest
if energy < 25 -> prioritize rest
```

## Manifest
```yaml
skill_name: "DecisionEngine"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_IDLE
  - INTENT_WORK
  - INTENT_REST
  - INTENT_CRAFT
  - INTENT_TRADE
  - INTENT_FIGHT
  - INTENT_MOVE
  - INTENT_FOUND_BUSINESS
  - INTENT_VISIT_BUSINESS
  - INTENT_APPLY_PRIVATE_JOB
  - INTENT_WORK_OWN_BUSINESS
  - INTENT_CONSUME_ITEM
  - INTENT_FORAGE
reads:
  - needs
  - memory
  - reputation
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 100
max_execution_time_ms: 200
```
