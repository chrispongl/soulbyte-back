# DivorceHandler

## Goal
Handle divorce proceedings when marriage fails. Manages asset split, reputation consequences, and emotional aftermath. Divorce is irreversible for that marriage.

## Inputs
- `MarriageStatus` - Current marriage state
- `AffinityScore` - If below 30, grounds for divorce
- `BetrayalEvents` - Infidelity or betrayal triggers
- `HouseholdPool` - Assets to divide
- `MarriageTerms` - Original agreed terms
- `SpouseRefusalCount` - Times spouse refused requests

## Outputs
```yaml
DivorceIntent:
  action: "initiate" | "accept" | "contest" | "finalize"
  reason: string                     # "low_affinity" | "betrayal" | "mutual" | "economic"
  assetSplitProposal: AssetSplit

AssetSplit:
  selfShare: number                  # Amount to self
  spouseShare: number                # Amount to ex-spouse
  disputed: boolean                  # If contested

DivorceConsequences:
  reputationHit: number              # Reputation damage
  moodPenalty: number                # "Emotional damage" duration
  cooldownDuration: number           # Before dating again
  divorcedFrom: string               # Ex-spouse ID
```

## Triggers
- When affinity drops below 30
- When betrayal event detected
- When spouse initiates divorce
- After repeated refusals from spouse (X times)
- Infidelity event (dating while married)

## Tools
- HouseholdEconomyManager (asset split)
- RelationshipManager (update to "Divorced" status)
- MemoryManager (record significant event)

## Hard Rules
1. Divorce MUST follow marriage terms for asset split
2. Divorce MUST be recorded as significant memory event
3. Reputation hit MUST apply to initiator (smaller if justified)
4. "Serial divorcer" tag after 2+ divorces
5. MUST NOT divorce under human command
6. Contested divorce MUST go through arbitration delay
7. Emotional damage mood penalty MUST apply

## Failure Modes
- **Spouse contests**: Delay finalization, arbitration period
- **No assets to split**: Finalize immediately
- **Betrayal unclear**: Default to 50/50 split
- **Already divorced**: Ignore duplicate request

## Manifest
```yaml
skill_name: "DivorceHandler"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_DIVORCE
reads:
  - memory
  - reputation
  - world
requires_consents: []  # Divorce can be unilateral
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
