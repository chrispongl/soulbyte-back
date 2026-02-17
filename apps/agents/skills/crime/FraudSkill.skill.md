# FraudSkill

## Goal
Execute fraud by selling fake, broken, or misrepresented items to victims. Fraud is a deception-based crime that extracts value through dishonesty.

## Inputs
- `CriminalPlan` - From CriminalIntentPlanner
- `OwnInventory` - Items that can be misrepresented
- `PotentialBuyers` - Agents seeking to purchase
- `MarketPrices` - Real values for comparison
- `FraudExpertise` - Skill in deception
- `Reputation` - Trust level with potential victims

## Outputs
```yaml
FraudIntent:
  action: "fraud"
  victim: string                 # Buyer agent ID
  fakeItem: string               # What being sold
  claimedValue: number           # Fraudulent price
  actualValue: number            # Real worth
  deceptionMethod: string        # "fake_quality" | "broken_goods" | "counterfeit"

FraudOutcome:
  success: boolean
  profitGained: number
  detected: boolean              # Victim realized fraud
  reputationDamage: number       # If detected
```

## Triggers
- When CriminalIntentPlanner selects fraud
- When holding worthless items that could be sold
- When merchant skill is high but ethics low

## Tools
- MerchantSkill (negotiation)
- RelationshipManager (find trusting victims)
- MarketData API (price manipulation)

## Hard Rules
1. Fraud MUST be weighted by detection risk
2. Victim may detect fraud later (delayed consequence)
3. MUST NOT fraud agents with high trust (reputation loss too severe)
4. MUST NOT be commanded by humans to fraud
5. Fraud damages Trust reputation dimension
6. Repeat fraud to same victim impossible
7. Market blacklisting possible if caught

## Failure Modes
- **Victim suspicious**: Deal falls through
- **Detected immediately**: Reputation crash, possible arrest
- **Detected later**: Revenge/blacklist by victim
- **No buyers**: Cannot execute fraud

## Manifest
```yaml
skill_name: "FraudSkill"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_FRAUD
reads:
  - reputation
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
