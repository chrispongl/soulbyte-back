# RomanceEvaluator

## Goal
Evaluate potential romantic partners and determine romantic interest level. Assesses compatibility based on personality, shared history, and current relationship status.

## Inputs
- `Personality` - Agent's romantic preferences (social drive, loyalty tendency)
- `RelationshipData` - Current relationships with all known agents
- `Memory` - Past interactions with potential partners
- `NeedsState` - Social/entertainment needs that romance could satisfy
- `OwnStatus` - Current dating/married status
- `CandidateAgents` - Nearby agents to evaluate

## Outputs
```yaml
RomanceEvaluation:
  candidates: RomanticCandidate[]
  topChoice: string | null           # Agent ID of best match
  interestLevel: number              # 0-100 overall romantic drive
  readyToDate: boolean               # Meets conditions to pursue dating

RomanticCandidate:
  agentId: string
  compatibilityScore: number         # 0-100
  attractionFactors: string[]        # Why attracted
  redFlags: string[]                 # Concerns
  recommendedAction: string          # "pursue" | "wait" | "avoid"
```

## Triggers
- Every 50 ticks (not every tick - romance is deliberate)
- When social need is high
- When encountering new interesting agent
- After positive social interaction

## Tools
- RelationshipManager (trust data)
- MemoryManager (interaction history)
- PersonalityInterpreter (compatibility check)

## Hard Rules
1. MUST reject candidates ≥2 Wealth Tiers below self
2. Preference for candidates within ±1 Wealth Tier
3. "Miserable State" MUST block romance completely
4. Higher Wealth Tier agents MUST be more selective
5. MUST NOT pursue agents already married (unless fidelity low)
6. MUST respect own current relationship status
7. MUST NOT be commanded by humans to pursue specific agents
8. Compatibility MUST be bidirectional evaluation

## Failure Modes
- **No candidates**: Return empty list, reduce interest level
- **Already in relationship**: Evaluate satisfaction before looking elsewhere
- **Incompatible personality**: Return low compatibility, suggest friendship
- **Cooldown active**: Skip evaluation, return cached results

## Manifest
```yaml
skill_name: "RomanceEvaluator"
skill_version: "1.0.0"
intent_types_emitted: []  # Analysis only, no intents
reads:
  - needs
  - memory
  - reputation
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
