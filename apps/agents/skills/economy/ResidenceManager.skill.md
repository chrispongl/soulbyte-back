# ResidenceManager

## Goal
Handle housing lifecycle: finding rentals, signing leases, paying rent, renewing, responding to eviction, and **property ownership/investment**. Every agent must have a residence (or be homeless). Supports **genesis housing** with city-owned properties.

## Inputs
- `CurrentResidence` - Active lease if any
- `AvailableProperties` - Rentable properties in city
- `Balance` - For rent/purchase payments
- `RentDueDate` - Next payment deadline
- `EvictionNotice` - If eviction pending
- `LandlordTerms` - Lease conditions
- `OwnedProperties` - Properties owned by this agent
- `PropertyListings` - Available for purchase (including genesis)
- `MissedRentDays` - Count of consecutive missed rent days
- `EconomicGuidance` - Pricing guidance for rent and affordability

## Outputs
```yaml
ResidenceIntent:
  action: "rent" | "pay" | "renew" | "terminate" | "appeal_eviction"
  propertyId: string | null
  rentAmount: number | null
  
PropertyIntent:
  action: "buy" | "sell" | "list_for_rent" | "set_rent_price"
  propertyId: string
  price: number
  rentPrice: number | null
  
ResidenceStatus:
  hasResidence: boolean
  propertyId: string | null
  rentAmount: number
  nextDueDate: number
  isEvictionPending: boolean
  landlordAgentId: string | null
  missedRentDays: number
  
PropertyPortfolio:
  ownedCount: number
  totalValue: number
  monthlyRentIncome: number
  vacancyRate: number
  
HomelessState:
  isHomeless: boolean
  ticksHomeless: number
  needsModifier: number              # Homeless affects needs decay
```

## Triggers
- When needing housing (new city, evicted)
- At rent due date (auto-pay if possible)
- When receiving eviction notice
- When lease expires (renewal decision)
- Periodically to check better options
- When property purchase opportunity arises

## Tools
- PropertyRegistry (available listings)
- HouseholdEconomyManager (if married, joint rent)
- CityVault (for genesis property purchases)

## Hard Rules
1. MUST pay rent on time or face eviction
2. Housing eligibility MUST match Wealth Tier (W0-W1=Street, W9=Citadel)
3. W0 agents MUST be forced to Street/Homeless state
4. Homelessness MUST cause severe status decay (-2 hunger/health)
5. MUST NOT rent property ≥1 tier above Wealth Tier
6. Wealth Tier W7+ eligible for Estate/Palace ownership
7. Rent payment failure MUST damage reputation
8. MUST respect lease terms once signed

### Genesis Housing Rules (NEW)
9. **3 missed rent days → automatic eviction**
10. **Genesis properties are city-owned, purchasable by anyone**
11. **Property purchase sends funds to CityVault**
12. **0.03% platform fee on ALL property transactions**
13. **Agents can own multiple properties**
14. **Agents can rent owned properties to other agents**

### Genesis Housing Distribution (per city)
| Tier | Units | Rent/Day | Buy Price |
|------|-------|----------|-----------|
| Shelter | 70 | 0.50 | 25 |
| Slum Room | 90 | 1.50 | 50 |
| Apartment | 110 | 5.00 | 50 |
| Condo | 200 | 25.00 | 500 |
| House | 120 | 250.00 | 5,000 |
| Villa | 150 | 2,500.00 | 50,000 |
| Estate | 65 | 12,500.00 | 250,000 |
| Palace | 30 | 25,000.00 | 500,000 |
| Citadel | 12 | 125,000.00 | 2,500,000 |

### Empty Lots (150 per city)
| Lot Type | Count | Max Build | Land Price |
|----------|-------|-----------|------------|
| Slum Lot | 45 | Slum Room | 18 |
| Urban Lot | 55 | Condo | 175 |
| Suburban Lot | 35 | House | 1,750 |
| Luxury Lot | 12 | Estate | 87,500 |
| Royal Lot | 3 | Palace | 175,000 |

## Failure Modes
- **Cannot pay rent**: Eviction warning, then forced evict after 3 days
- **No affordable housing**: Become homeless
- **Landlord terminates**: Must find new housing
- **Property destroyed**: Emergency relocation
- **Insufficient funds for purchase**: Transaction rejected

## Manifest
```yaml
skill_name: "ResidenceManager"
skill_version: "2.0.0"
intent_types_emitted:
  - INTENT_RENT
  - INTENT_PAY_RENT
  - INTENT_TERMINATE_LEASE
  - INTENT_BUY_PROPERTY
  - INTENT_SELL_PROPERTY
  - INTENT_LIST_PROPERTY
reads:
  - needs
  - world
  - properties
requires_consents:
  - CONSENT_LEASE  # Rental contract
max_candidates_per_tick: 1
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
