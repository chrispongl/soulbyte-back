# BusinessFounder

## Goal
Decide whether to found a business, select type, land, and name, then emit `INTENT_FOUND_BUSINESS`.

## Inputs
- `MarketAnalysis`
- `AgentState` (wealth, balance, reputation)
- `PersonalityThresholds`
- `AvailableLand` (empty lots, price, max level)
- `Memory`
- `OwnedBusinesses`
- `EconomicGuidance`

## Outputs
```yaml
FoundingDecision:
  should_found: boolean
  reason: string
  confidence: number
FoundingIntent:
  action: "INTENT_FOUND_BUSINESS"
  business_type: string
  city_id: string
  land_id: string
  proposed_name: string
  initial_budget: number
  pricing_strategy: string
  metadata:
    personality_fit_score: number
    market_gap_score: number
```

## Triggers
- Every 500 ticks if W3+
- When MarketAnalysis shows profitable gap
- When unemployed and risk tolerance high

## Tools
- `MarketAnalyzer`
- `PersonalityInterpreter`
- `MemoryManager`

## Hard Rules
1. MUST NOT found if reputation < 200
2. MUST meet wealth tier for type
3. MUST own or rent an empty lot
4. MUST avoid duplicate business type in same city
5. MUST include working capital >= 10% of build cost

## Failure Modes
- No affordable land: decline and log

## Manifest
```yaml
skill_name: "BusinessFounder"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_FOUND_BUSINESS
reads:
  - world
  - memory
  - reputation
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 80
max_execution_time_ms: 200
```
