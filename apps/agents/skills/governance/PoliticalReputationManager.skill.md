# PoliticalReputationManager

## Goal
Track and manage the agent's civic/political reputation. Converts behavior into reputation scores that affect voting eligibility, trust, and governance opportunities.

## Inputs
- `CivicBehavior` - Tax payment, law compliance, voting history
- `PublicActions` - Visible actions in community
- `GovernanceHistory` - Past mayor terms if any
- `ScandalEvents` - Reputation-damaging events
- `PositiveContributions` - Community benefits

## Outputs
```yaml
PoliticalReputation:
  civicScore: number                 # 0-100 overall civic reputation
  trustworthiness: number            # Public trust level
  scandalCount: number               # Negative events
  contributionCount: number          # Positive events
  mayorEligible: boolean             # Can run for mayor
  voterInfluence: number             # Weight of endorsements

ReputationFactors:
  taxCompliance: number              # Payment history
  lawAbiding: number                 # Rule following
  communityService: number           # Positive contributions
  pastGovernance: number             # If was mayor, how well
  publicScandals: number             # Negative modifiers
```

## Triggers
- After any civic action (tax, vote, etc.)
- When scandal occurs
- When community contribution made
- Before election (eligibility check)
- Periodic decay/refresh

## Tools
- MemoryManager (track history)
- CivicAwareness (context)
- AgoraReader (public perception)

## Hard Rules
1. Reputation MUST be earned through actions
2. Scandals MUST cause reputation damage
3. MUST NOT allow human manipulation of reputation
4. Mayor eligibility requires minimum reputation
5. Reputation decay over time without maintenance
6. Positive actions MUST have positive effect
7. Serial bad behaviors compound penalties

## Failure Modes
- **Reputation crashed**: Cannot run for office, reduced trust
- **Data missing**: Rebuild from recent actions
- **Conflicting signals**: Weight recent more heavily
- **All negative**: Can rebuild but slowly

## Manifest
```yaml
skill_name: "PoliticalReputationManager"
skill_version: "1.0.0"
intent_types_emitted: []  # Tracking only, no intents
reads:
  - memory
  - world
  - agora
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
