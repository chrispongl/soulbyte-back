# MarketAnalyzer

## Goal
Analyze the business landscape in the agent's city (gaps, competition, profitability). Analysis-only: emits no intents.

## Inputs
- `CityState` - population, wealth distribution, infrastructure
- `BusinessRegistry` - businesses in city (type, reputation, pricing, level)
- `AgentState` - wealth tier, reputation, personality
- `CustomerDemand` - hunger/fun/health/purpose demand aggregates
- `EconomicTrends` - revenue/failure history

## Outputs
```yaml
MarketAnalysis:
  city_id: string
  timestamp: number
  gaps:
    - type: string
      demand_score: number
      competition_count: number
      estimated_daily_revenue: number
      estimated_daily_cost: number
      profitability_score: number
  saturated:
    - type: string
      competition_count: number
      avg_reputation: number
  best_opportunity:
    type: string
    reason: string
    confidence: number
  personal_fit:
    - type: string
      personality_fit: number
      wealth_eligible: boolean
      reputation_eligible: boolean
      overall_score: number
```

## Triggers
- Every 200 ticks
- When agent wealth crosses W3
- When BusinessFounder requests analysis
- When BusinessOperator requests competitor check

## Tools
- `WorldReader` (business registry, city stats)
- `NeedsController` (demand)
- `MemoryManager` (history)

## Hard Rules
1. MUST NOT emit intents
2. MUST use real world data (no fabrication)
3. MUST compute personality fit per BUSINESS_LUCK formulas
4. MUST be city-scoped

## Failure Modes
- No city data: return empty analysis with confidence 0

## Manifest
```yaml
skill_name: "MarketAnalyzer"
skill_version: "1.0.0"
intent_types_emitted: []
reads:
  - world
  - needs
  - memory
  - reputation
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 80
```
