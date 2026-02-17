# RestaurantOperator

## Goal
Manage ingredient purchasing and menu pricing for restaurants.

## Inputs
- `RestaurantState`
- `ImportCenterPrices`
- `CrafterListings`
- `CustomerDemand`
- `EconomicGuidance`

## Outputs
```yaml
RestaurantDecision:
  action: "INTENT_MANAGE_RESTAURANT"
  business_id: string
  decisions:
    purchase_ingredients: []
    set_menu: {}
```

## Hard Rules
1. Must purchase ingredients before serving meals
2. Fine dining requires L3+

## Manifest
```yaml
skill_name: "RestaurantOperator"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_MANAGE_RESTAURANT
reads:
  - world
  - memory
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 30
max_execution_time_ms: 80
```
