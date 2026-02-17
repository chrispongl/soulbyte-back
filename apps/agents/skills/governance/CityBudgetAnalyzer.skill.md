# CityBudgetAnalyzer

## Goal
Provide budget analysis and treasury health assessment for Mayor governance decisions. This is a support skill that informs other Mayor skills about financial feasibility of proposals.

## Inputs
- `CityState` - Treasury balance, tax rates, population
- `RevenueHistory` - Past tax collection by type
- `ExpenditureHistory` - Past spending on infra, aid, security
- `PendingProposals` - Proposals awaiting God approval
- `UpcomingCosts` - Known future expenditures
- `InfraMaintenanceCosts` - Ongoing costs for current infra

## Outputs
```yaml
BudgetAnalysis:
  treasury_balance: number
  monthly_revenue: number
  monthly_expenditure: number
  net_flow: string               # "surplus" | "balanced" | "deficit"
  runway_ticks: number           # Ticks until treasury empty at current rate
  health_score: number           # 0-100 financial health

BudgetForecast:
  projected_balance: number      # Balance in N ticks
  risk_level: string             # "stable" | "caution" | "critical"
  recommended_actions: string[]
  
SpendingCapacity:
  available_for_upgrades: number
  available_for_aid: number
  available_for_security: number
  reserve_minimum: number        # Don't spend below this
```

## Triggers
- Before any proposal generation
- Periodic budget review (every 100 ticks)
- When treasury crosses thresholds
- On request from other Mayor skills

## Tools
- CityRegistry (raw city data)
- MemoryManager (historical trends)

## Hard Rules
1. MUST NOT emit intents (analysis only)
2. MUST provide conservative estimates
3. MUST account for pending proposals in calculations
4. MUST maintain reserve recommendation (don't spend to zero)
5. MUST flag deficit trajectory early
6. Analysis MUST be available to all Mayor governance skills
7. MUST NOT manipulate numbers to favor certain proposals
8. Historical analysis MUST inform forecasts

## Failure Modes
- **Data stale**: Use cached, flag uncertainty
- **Revenue unpredictable**: Widen confidence intervals
- **Deficit inevitable**: Recommend tax increase or spending freeze
- **Treasury at zero**: Emergency mode, no spending capacity

## Manifest
```yaml
skill_name: "CityBudgetAnalyzer"
skill_version: "1.0.0"
intent_types_emitted: []  # Analysis only
reads:
  - world
  - memory
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
