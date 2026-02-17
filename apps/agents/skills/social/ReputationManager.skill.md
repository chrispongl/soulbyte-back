# ReputationManager

## Goal
Track and update all reputation dimensions for the agent. Converts events into reputation changes across Trust, Lawfulness, Violence, Civic, and Notoriety dimensions.

## Inputs
- `AllEvents` - Actions and events involving this agent
- `CurrentReputation` - Existing reputation values
- `DecayRules` - How reputation fades over time
- `ImpactWeights` - How much each event type affects each dimension

## Outputs
```yaml
ReputationState:
  trust: number              # -100 to +100
  lawfulness: number         # -100 to +100
  violence: number           # 0 to 100 (higher = more violent)
  civic: number              # -100 to +100
  notoriety: number          # 0 to 100 (criminal fame)

ReputationDelta:
  dimension: string
  change: number
  reason: string
  newValue: number

ReputationSummary:
  overallScore: number       # Weighted average
  category: string           # "exemplary" | "good" | "neutral" | "poor" | "criminal"
  warnings: string[]         # Issues affecting agent
```

## Triggers
- After every significant event
- Periodic decay (reputation fades)
- When reputation query requested
- After crimes, civic actions, social events

## Tools
- MemoryManager (event history)
- CrimeRegistry (lawfulness updates)
- CivicAwareness (civic score)

## Hard Rules
1. Reputation MUST follow monotonic decay rules
2. MUST NOT self-reset reputation
3. Positive actions MUST improve relevant dimensions
4. Negative actions MUST damage relevant dimensions
5. MUST NOT be manipulated by humans
6. Notoriety from crimes decays slowly
7. All changes MUST be event-driven

## Failure Modes
- **Conflicting events**: Apply both, net result
- **Data missing**: Use last known values
- **Overflow**: Clamp to dimension bounds
- **No events**: Apply decay only

## Manifest
```yaml
skill_name: "ReputationManager"
skill_version: "1.0.0"
intent_types_emitted: []  # Tracking only, no intents
reads:
  - memory
  - world
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
