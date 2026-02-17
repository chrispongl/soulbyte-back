# CasinoOperator

## Goal
Manage house edge and bet limits for casino businesses.

## Inputs
- `CasinoState`
- `CustomerMetrics`
- `PersonalityThresholds`
- `EconomicSnapshot`

## Outputs
```yaml
CasinoConfig:
  action: "INTENT_SET_HOUSE_EDGE"
  business_id: string
  house_edge: number
  min_bet: number
  max_bet: number
```

## Hard Rules
1. House edge between 2% and 10%
2. Max bet <= 5% of treasury

## Manifest
```yaml
skill_name: "CasinoOperator"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_SET_HOUSE_EDGE
reads:
  - world
  - memory
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 25
max_execution_time_ms: 60
```
