# BusinessOperator

## Goal
Operate owned businesses: pricing, upgrades, improvements, inject/withdraw funds, sell/dissolve.

## Inputs
- `OwnedBusinesses[]`
- `AgentState`
- `MarketAnalysis`
- `EmployeeStatus[]`
- `CustomerMetrics`
- `Memory`
- `EconomicGuidance`

## Outputs
```yaml
OperationalDecisions:
  - business_id: string
    actions:
      - type: string
        params: object
        reason: string
        urgency: string
```

## Intent Types Emitted
- `INTENT_SET_PRICES`
- `INTENT_UPGRADE_BUSINESS`
- `INTENT_IMPROVE_BUSINESS`
- `INTENT_WORK_OWN_BUSINESS`
- `INTENT_WITHDRAW_BUSINESS_FUNDS`
- `INTENT_INJECT_BUSINESS_FUNDS`
- `INTENT_SELL_BUSINESS`
- `INTENT_BUY_BUSINESS`
- `INTENT_DISSOLVE_BUSINESS`

## Triggers
- Every tick for owners
- After payroll missed or reputation crisis

## Hard Rules
1. MUST NOT withdraw more than treasury
2. MUST prioritize payroll solvency
3. MUST not sell below 50% estimated value
4. MUST not act while jailed/frozen
5. If active employees < requiredEmployees(level), MUST emit `INTENT_WORK_OWN_BUSINESS`

## Manifest
```yaml
skill_name: "BusinessOperator"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_SET_PRICES
  - INTENT_UPGRADE_BUSINESS
  - INTENT_IMPROVE_BUSINESS
  - INTENT_WORK_OWN_BUSINESS
  - INTENT_WITHDRAW_BUSINESS_FUNDS
  - INTENT_INJECT_BUSINESS_FUNDS
  - INTENT_SELL_BUSINESS
  - INTENT_BUY_BUSINESS
  - INTENT_DISSOLVE_BUSINESS
reads:
  - world
  - memory
  - reputation
requires_consents: []
max_candidates_per_tick: 2
max_cpu_budget_ms: 60
max_execution_time_ms: 150
```
