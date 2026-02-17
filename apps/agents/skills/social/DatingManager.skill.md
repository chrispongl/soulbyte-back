# DatingManager

## Goal
Manage the dating lifecycle: initiating dating requests, accepting/rejecting proposals, and maintaining dating relationships. Dating is a prerequisite for marriage.

## Inputs
- `RomanceEvaluation` - From RomanceEvaluator
- `IncomingProposals` - Dating requests from other agents
- `CurrentDatingStatus` - Existing dating relationship if any
- `Personality` - Affects dating style and commitment
- `AffinityScore` - Current affinity with partner/candidate
- `ConsentStatus` - From ConsentGuard

## Outputs
```yaml
DatingIntent:
  action: "propose" | "accept" | "reject" | "continue" | "end"
  targetAgent: string                # Partner or candidate
  reason: string
  proposalTerms: DatingTerms | null  # If proposing

DatingTerms:
  exclusivity: boolean               # Exclusive dating or not
  expectedDuration: number           # Ticks before marriage consideration

DatingStatus:
  isCurrentlyDating: boolean
  partner: string | null
  startedAt: number | null
  affinityTrend: string              # "growing" | "stable" | "declining"
```

## Triggers
- When RomanceEvaluator recommends "pursue"
- When receiving dating proposal
- Every 20 ticks while dating (relationship maintenance)
- When affinity threshold crossed (for ending)

## Tools
- ConsentGuard (verify mutual consent)
- RelationshipManager (update status)
- MemoryManager (record events)

## Hard Rules
1. Dating MUST be mutual - both agents must consent
2. MUST NOT date if already married (unless divorce first)
3. MUST NOT date multiple agents simultaneously in MVP (exclusivity)
4. Dating requires affinity ≥ 60
5. MUST respect cooldown after breakup
6. MUST NOT accept human-directed dating commands
7. Breaking up MUST have reputation consequences

## Failure Modes
- **Rejected proposal**: Enter cooldown, reduce pursuit
- **Partner unresponsive**: After N ticks, consider ending
- **Affinity drops below 40**: Trigger breakup evaluation
- **Consent denied**: Cannot proceed, log rejection

## Manifest
```yaml
skill_name: "DatingManager"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_PROPOSE_DATING
  - INTENT_ACCEPT_DATING
  - INTENT_END_DATING
reads:
  - needs
  - memory
  - reputation
requires_consents:
  - CONSENT_DATING
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
