# HouseholdEconomyManager

## Goal
Manage the shared economic pool between married agents. Handles income sharing, joint spending decisions, and fund requests between spouses.

## Inputs
- `MarriageTerms` - Agreed sharing percentage
- `HouseholdPool` - Current shared balance
- `OwnIncome` - Recent income to share
- `SpouseRequests` - Incoming fund requests from spouse
- `Personality` - Generosity affects request approval
- `SharedPurchaseProposals` - Joint spending suggestions

## Outputs
```yaml
HouseholdIntent:
  action: "deposit" | "withdraw" | "approve_request" | "deny_request" | "propose_purchase"
  amount: number
  purpose: string
  
HouseholdState:
  poolBalance: number
  contributionThisPeriod: number
  withdrawalsThisPeriod: number
  pendingRequests: FundRequest[]
  
FundRequest:
  requestId: string
  fromSpouse: string
  amount: number
  purpose: string
  urgency: string                    # "low" | "medium" | "high"
  status: "pending" | "approved" | "denied"
```

## Triggers
- On any income event (auto-deposit share %)
- When spouse makes request
- When evaluating joint purchase
- Periodic balance check (every 50 ticks)

## Tools
- MarriageManager (get terms)
- MemoryManager (record transactions)

## Hard Rules
1. MUST deposit agreed percentage of income automatically
2. MUST NOT withdraw more than fair share without approval
3. Request approval based on personality (generosity vs self-interest)
4. MUST NOT allow external manipulation of pool
5. On divorce, pool MUST split per DivorceHandler
6. Repeated denials MUST strain relationship (affinity impact)
7. MUST log all transactions for transparency

## Failure Modes
- **Pool empty**: Deny withdrawals, flag economic stress
- **Spouse over-requesting**: May deny, log frustration
- **Terms violated**: Alert for renegotiation or divorce grounds
- **Income zero**: Skip deposit, no penalty

## Manifest
```yaml
skill_name: "HouseholdEconomyManager"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_HOUSEHOLD_TRANSFER
reads:
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
