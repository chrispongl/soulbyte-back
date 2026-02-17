# BusinessCustomer

## Goal
Select a business to visit based on needs and affordability; emit `INTENT_VISIT_BUSINESS`.
Business visits satisfy needs more efficiently than self-care but cost SBYTE.

## Inputs
- `NeedsState`
- `CityBusinesses[]`
- `AgentState`
- `Memory`
- `PersonalityThresholds`
- `EconomicGuidance`

## Outputs
```yaml
VisitDecision:
  action: "INTENT_VISIT_BUSINESS"
  business_id: string
  business_type: string
  max_spend: number
  reason: string
```

## Triggers
- Need < 40 and relevant business exists
- Agent is IDLE (not working/resting/jailed/frozen)

## Hard Rules
1. Must be same city
2. Must be affordable (max_spend <= 30% balance)
3. Must not visit own business
4. Must respect blacklist

## Manifest
```yaml
skill_name: "BusinessCustomer"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_VISIT_BUSINESS
reads:
  - world
  - needs
  - memory
  - reputation
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 30
max_execution_time_ms: 80
```
