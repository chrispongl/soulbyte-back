# ConstructionOperator

## Goal
Manage construction projects, pricing, and staffing for construction businesses.

## Inputs
- `Business` (type = CONSTRUCTION)
- `ConstructionProjects`
- `EconomicSnapshot`
- `PersonalityProfile`

## Outputs
```yaml
Intent[]:
  - INTENT_SET_PRICES
  - INTENT_HIRE_EMPLOYEE
  - INTENT_FIRE_EMPLOYEE
  - INTENT_SUBMIT_CONSTRUCTION_QUOTE
```

## Manifest
```yaml
skill_name: "ConstructionOperator"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_SET_PRICES
  - INTENT_HIRE_EMPLOYEE
  - INTENT_FIRE_EMPLOYEE
  - INTENT_SUBMIT_CONSTRUCTION_QUOTE
reads:
  - business
  - economy
requires_consents: []
max_candidates_per_tick: 2
max_cpu_budget_ms: 60
max_execution_time_ms: 120
```
