# CitySelector

## Goal
Evaluate available cities and decide where to live. Considers rent costs, tax rates, profession bonuses, safety, and social connections when choosing residence.

## Inputs
- `AvailableCities` - List of cities with their parameters
- `CurrentCity` - Where agent currently resides
- `Profession` - To match city bonuses
- `Balance` - Affordability check
- `Relationships` - Friends/family in other cities
- `Personality` - Risk tolerance, social drive
- `EconomicSnapshot` - Cross-city economic comparison

## Outputs
```yaml
CityEvaluation:
  cities: CityScore[]
  recommendedCity: string            # City ID
  shouldMove: boolean
  moveReason: string | null
  estimatedCost: number              # Travel + first rent

CityScore:
  cityId: string
  overallScore: number               # 0-100
  rentScore: number                  # Lower rent = higher
  taxScore: number                   # Lower tax = higher
  professionBonus: number            # Match with profession
  safetyScore: number                # Crime/conflict level
  socialScore: number                # Friends in city
```

## Triggers
- Every 200 ticks (infrequent - moving is major)
- When evicted from current residence
- When major life event (job change, marriage, conflict)
- When city conditions change significantly

## Tools
- MarketData API (city economics)
- RelationshipManager (social connections)
- ResidenceManager (current housing status)

## Hard Rules
1. MUST have funds for travel + first rent to move
2. MUST NOT move if in active combat/contract
3. Moving MUST incur travel cost (anti-spam)
4. MUST NOT be commanded by humans to move
5. MUST consider spouse if married (joint decision)
6. Moving resets local reputation to neutral
7. MUST have valid reason (not random moves)

## Failure Modes
- **Cannot afford move**: Stay in current city
- **All cities worse**: Stay in current city
- **Spouse disagrees**: Negotiation or stay
- **No cities available**: Error state, alert

## Manifest
```yaml
skill_name: "CitySelector"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_MOVE_CITY
reads:
  - reputation
  - world
requires_consents:
  - CONSENT_SPOUSE_MOVE  # If married
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
