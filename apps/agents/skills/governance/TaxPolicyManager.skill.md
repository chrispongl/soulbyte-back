# TaxPolicyManager

## Goal
Analyze tax policies and generate tax change proposals for the MayorGovernanceSkill. This is an **analysis-only skill** - it does NOT emit intents directly. MayorGovernanceSkill is the sole emitter of governance intents.

## Inputs
- `CityState` - Current tax rates (rent, trade, profession, city_fee)
- `TreasuryHealth` - Current balance and revenue trends
- `PopulationTrends` - Migration in/out patterns
- `CompetingCities` - Tax rates of nearby cities
- `CityNeeds` - Funding requirements for infrastructure
- `TaxBounds` - Min/max allowed rates by God

## Outputs
```yaml
TaxProposal:
  city_id: string
  tax_type: string               # "rent_tax_rate" | "trade_tax_rate" | "profession_tax_rate" | "city_fee_rate"
  current_rate: number
  proposed_rate: number
  justification: string
  expected_revenue_change: number
  expected_migration_impact: string  # "attract" | "neutral" | "repel"

TaxAnalysis:
  current_rates: TaxRates
  recommended_changes: TaxChange[]
  competitiveness_score: number  # 0-100 vs other cities
  revenue_forecast: number
  citizen_burden_score: number   # 0-100 (higher = more burden)
```

## Triggers
- Periodic tax review (every 300 ticks)
- When treasury critically low
- When population migration is negative
- When infrastructure funding needed
- After major city event (disaster, growth)
- **On request from MayorGovernanceSkill**

## Tools
- CivicAwareness (economic trends)
- CityBudgetAnalyzer (revenue projections)
- AgoraReader (citizen sentiment on taxes)

## Hard Rules
1. Tax rates MUST stay within global bounds
2. city_fee_rate MUST be 0.01% - 2.0%
3. Tax changes MUST be proposed, not applied directly
4. MUST NOT target specific agents with rates
5. MUST consider citizen welfare, not just revenue
6. MUST NOT change rates faster than cooldown allows
7. Proposals require God approval to take effect
8. MUST log all tax change proposals
9. **MUST NOT emit intents - output proposals for MayorGovernanceSkill to consume**

## Failure Modes
- **Rate at bound**: Cannot adjust further in that direction
- **God rejects**: Proposal denied, adjust strategy
- **Citizens revolt**: High taxes may trigger migration
- **Treasury still low**: Consider spending cuts vs tax hikes

## Manifest
```yaml
skill_name: "TaxPolicyManager"
skill_version: "2.0.0"
intent_types_emitted: []        # Analysis only - MayorGovernanceSkill emits intents
reads:
  - world
  - agora
requires_consents: []
max_candidates_per_tick: 0      # Analysis only
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
