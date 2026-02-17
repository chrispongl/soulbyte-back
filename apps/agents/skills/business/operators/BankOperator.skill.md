# BankOperator

## Goal
Manage bank interest rates and loan approvals.

## Inputs
- `BankState`
- `LoanApplications[]`
- `ActiveLoans[]`
- `PersonalityThresholds`
- `EconomicSnapshot`

## Outputs
```yaml
LoanDecision:
  action: "INTENT_APPROVE_LOAN" | "INTENT_DENY_LOAN"
  terms:
    principal: number
    daily_interest_rate: number
    duration_ticks: number
RateChange:
  action: "INTENT_SET_LOAN_TERMS"
  business_id: string
  loan_rate: number
  deposit_rate: number
```

## Hard Rules
1. Loan rate 0.1%–5.0% daily
2. Deposit rate < loan rate
3. No loan if principal > 50% treasury

## Manifest
```yaml
skill_name: "BankOperator"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_APPROVE_LOAN
  - INTENT_DENY_LOAN
  - INTENT_SET_LOAN_TERMS
reads:
  - world
  - memory
requires_consents: []
max_candidates_per_tick: 2
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
