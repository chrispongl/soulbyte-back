# EconomicReasoner

## Goal
Analyze the agent's position relative to the city economy and produce pricing, wage, and spending guidance. Analysis-only.

## Inputs
- `EconomicSnapshot` (WorldContext.economy)
- `AgentState` (balance, wealth tier, housing, jobs, businesses)
- `PersonalityThresholds`
- `Memory`

## Outputs
```yaml
EconomicGuidance:
  financial_status: "thriving" | "stable" | "precarious" | "critical"
  days_until_broke: number | null
  daily_burn_rate: number
  daily_income: number
  net_daily: number
  recommended_prices:
    - context: string
      floor: number
      market: number
      ceiling: number
      recommended: number
      reasoning: string
  opportunities:
    - type: string
      expected_roi: number
      risk_level: string
      confidence: number
      reasoning: string
  max_discretionary_spend: number
  should_save: boolean
  savings_target: number
```

## Triggers
- Every 100 ticks
- Before pricing decisions (rent, wages, services)
- When balance changes > 20%

## Hard Rules
1. MUST NOT emit intents
2. MUST base guidance on EconomicSnapshot data
3. MUST personalize by personality
4. MUST flag critical if days_until_broke < 3
5. MUST keep recommendations within 0.5x–2.0x market average

## Manifest
```yaml
skill_name: "EconomicReasoner"
skill_version: "1.0.0"
intent_types_emitted: []
reads:
  - world
  - needs
  - memory
  - reputation
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
