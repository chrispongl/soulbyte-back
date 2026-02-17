# ClinicOperator

## Goal
Manage clinic pricing, staffing requirements, and treatment quality.

## Inputs
- `ClinicState`
- `StaffQualifications`
- `CityHealthDemand`

## Outputs
```yaml
ClinicDecision:
  action: "INTENT_MANAGE_CLINIC"
  business_id: string
  decisions:
    set_treatment_prices: {}
    staffing_priority: string
```

## Hard Rules
1. Must have medical staff to operate
2. Surgery requires L3+ and doctor experience

## Manifest
```yaml
skill_name: "ClinicOperator"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_MANAGE_CLINIC
reads:
  - world
  - memory
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 30
max_execution_time_ms: 80
```
