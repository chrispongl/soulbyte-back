# EntertainmentOperator

## Goal
Schedule events and set entry fees for entertainment halls.

## Inputs
- `EntertainmentState`
- `CityAgents` (fun/purpose demand)
- `MarketAnalysis`

## Outputs
```yaml
EntertainmentDecision:
  action: "INTENT_HOST_EVENT"
  business_id: string
  event:
    event_type: string
    entry_fee: number
    prize_pool: number
```

## Hard Rules
1. Must not host events that exceed 50% treasury
2. Event capacity scales with business level

## Manifest
```yaml
skill_name: "EntertainmentOperator"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_HOST_EVENT
reads:
  - world
  - memory
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 30
max_execution_time_ms: 80
```
