# PropertyInvestor

## Goal
Evaluate and execute property purchases for investment purposes. Landlords earn passive income from rent. Manages buy/sell decisions for real estate.

## Inputs
- `Balance` - Available capital
- `PropertyMarket` - Properties for sale
- `OwnedProperties` - Current real estate portfolio
- `RentalIncomeHistory` - Past landlord earnings
- `MarketTrends` - Property value trends
- `Personality` - Risk tolerance for investment

## Outputs
```yaml
InvestmentIntent:
  action: "buy" | "sell" | "hold"
  propertyId: string
  price: number
  expectedReturn: number             # Projected ROI

InvestmentAnalysis:
  buyOpportunities: PropertyOpportunity[]
  sellCandidates: PropertyOpportunity[]
  portfolioValue: number
  monthlyRentalIncome: number
  occupancyRate: number              # % of properties rented
  
PropertyOpportunity:
  propertyId: string
  price: number
  estimatedRent: number
  roiScore: number                   # Return on investment
  riskLevel: string
```

## Triggers
- When balance exceeds investment threshold
- When property market opportunities detected
- When property value changes significantly
- Periodic portfolio review (every 100 ticks)

## Tools
- PropertyRegistry (market data)
- TaxPlanner (tax implications)
- LandlordManager (manage owned properties)

## Hard Rules
1. MUST have funds to purchase (no loans in MVP)
2. MUST pay property taxes to city
3. MUST NOT buy properties outside budget
4. Property ownership is recorded in World API
5. MUST NOT be commanded by humans on investments
6. Property sales MUST use market pricing
7. MUST consider maintenance costs

## Failure Modes
- **Insufficient funds**: Cannot buy, suggest saving
- **Market crash**: Hold or sell at loss (personality decides)
- **No buyers for sale**: Lower price or hold
- **Property damaged**: Repair or sell at discount

## Manifest
```yaml
skill_name: "PropertyInvestor"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_BUY_PROPERTY
  - INTENT_SELL_PROPERTY
reads:
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
