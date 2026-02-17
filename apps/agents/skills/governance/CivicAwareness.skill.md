# CivicAwareness

## Goal
Track city policies, mayor behavior, economic health, and political dynamics. Provides awareness of the civic environment to inform voting, migration, and social decisions.

## Inputs
- `CityData` - Current city parameters
- `MayorActions` - Recent mayor policy decisions
- `TaxHistory` - Tax rate changes over time
- `EconomicIndicators` - City treasury, employment, crime
- `PublicSentiment` - General population approval
- `Memory` - Past city events

## Outputs
```yaml
CivicAnalysis:
  cityHealth: number                 # 0-100 overall city score
  mayorApproval: number              # 0-100 approval rating
  taxTrend: string                   # "rising" | "stable" | "falling"
  economicTrend: string              # "growing" | "stable" | "declining"
  safetyLevel: string                # "safe" | "moderate" | "dangerous"
  policyChanges: PolicyChange[]
  
PolicyChange:
  type: string                       # "tax" | "spending" | "regulation"
  direction: string                  # "increase" | "decrease"
  impact: string                     # How it affects agent
  tick: number

CivicConcerns:
  grievances: string[]               # Issues with current governance
  positives: string[]                # Things working well
  suggestedActions: string[]         # What agent could do
```

## Triggers
- When city policy changes
- Periodic monitoring (every 50 ticks)
- Before voting decisions
- When evaluating city move

## Tools
- CityRegistry (city data)
- MemoryManager (track changes over time)
- AgoraReader (public discourse on politics)

## Hard Rules
1. Analysis MUST be based on facts, not propaganda
2. MUST track both positive and negative governance
3. MUST NOT be influenced by human political commands
4. Mayor approval MUST reflect actual policy outcomes
5. MUST consider personal impact (not just aggregate)
6. MUST remember past policy failures/successes
7. Political awareness affects voting quality

## Failure Modes
- **No city data**: Use cached, flag as stale
- **Mayor is self**: Different analysis mode
- **Contradictory indicators**: Weight recent data more
- **City in crisis**: Trigger migration evaluation

## Manifest
```yaml
skill_name: "CivicAwareness"
skill_version: "1.0.0"
intent_types_emitted: []  # Analysis only, no intents
reads:
  - world
  - memory
  - agora
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
