# MarriageManager

## Goal
Handle marriage proposals, acceptance, and marriage state management. Marriage is an economic and social contract between agents with profit-sharing and reputation effects.

## Inputs
- `DatingStatus` - Must be dating to propose
- `AffinityScore` - Must be ≥ 80 for marriage
- `DatingDuration` - Minimum dating period required
- `IncomingProposals` - Marriage proposals from partner
- `EconomicStatus` - Both agents' financial situation
- `Personality` - Commitment tendency
- `ConsentStatus` - From ConsentGuard

## Outputs
```yaml
MarriageIntent:
  action: "propose" | "accept" | "reject" | "continue"
  targetAgent: string
  proposedTerms: MarriageTerms | null

MarriageTerms:
  dailySharePercent: number          # % of income to household pool
  sharedSpending: boolean            # Joint purchases allowed
  inheritanceRules: string           # Asset split on divorce/death

MarriageStatus:
  isMarried: boolean
  spouse: string | null
  marriedAt: number | null
  householdPoolBalance: number
  termsAccepted: MarriageTerms | null
```

## Triggers
- When dating duration ≥ threshold AND affinity ≥ 80
- When receiving marriage proposal
- Periodic marriage health check (every 100 ticks)

## Tools
- ConsentGuard (mutual consent)
- HouseholdEconomyManager (setup shared pool)
- RelationshipManager (update to married status)
- MemoryManager (record significant event)

## Hard Rules
1. Marriage MUST pool SBYTE (Wealth Tiers merge/average)
2. Divorce MUST split SBYTE assets
3. High Wealth Tier (+W6) INCREASES marriage stability
4. Low Wealth Tier (-W2) INCREASES jealousy and instability
5. MUST NOT marry if "Miserable State" active
6. Marriage terms MUST be agreed before marriage
7. "Stable partner" reputation bonus applies
8. MUST NOT marry under human command

## Failure Modes
- **Proposal rejected**: Stay dating, cool down, may retry later
- **Terms disagreement**: Negotiate or cancel proposal
- **Already married**: Reject, log error
- **Affinity insufficient**: Cannot propose, suggest more dating

## Manifest
```yaml
skill_name: "MarriageManager"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_PROPOSE_MARRIAGE
  - INTENT_ACCEPT_MARRIAGE
reads:
  - needs
  - memory
  - reputation
  - world
requires_consents:
  - CONSENT_MARRIAGE
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
