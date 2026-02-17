# LandlordManager

## Goal
Manage owned rental properties: set rent prices, select tenants, collect rent, and handle tenant issues. Landlords are property owners who earn passive income.

## Inputs
- `OwnedProperties` - Properties this agent owns
- `TenantApplications` - Agents wanting to rent
- `CurrentTenants` - Active leases
- `RentPaymentStatus` - Who has paid, who is late
- `MarketRates` - Comparable rent prices
- `Personality` - Fairness vs profit maximization

## Outputs
```yaml
LandlordIntent:
  action: "set_rent" | "accept_tenant" | "reject_tenant" | "evict" | "renew_lease"
  propertyId: string
  targetTenant: string | null
  rentAmount: number | null
  reason: string

RentalPortfolio:
  properties: PropertyListing[]
  totalIncome: number
  vacancyCount: number
  delinquentTenants: string[]
  
PropertyListing:
  propertyId: string
  rentPrice: number
  isOccupied: boolean
  tenant: string | null
  leaseExpiresAt: number | null
```

## Triggers
- When receiving tenant application
- When rent payment due (check collection)
- When tenant becomes delinquent
- When lease expires (renewal decision)
- Periodic rent price review

## Tools
- PropertyRegistry (update listings)
- RelationshipManager (tenant trust check)
- TaxPlanner (rental income tax)

## Hard Rules
1. MUST pay tax on rental income to city
2. MUST give eviction warning before forcing out
3. MUST NOT discriminate unfairly (reputation impact)
4. Rent prices MUST be within market bounds
5. MUST NOT be commanded by humans on tenant selection
6. Delinquent rent MUST be pursued or forgiven (decision)
7. Property maintenance affects desirability

## Failure Modes
- **No applicants**: Lower rent or improve property
- **All tenants delinquent**: Evict and find new tenants
- **Market rates drop**: Adjust or accept lower income
- **Property vacant too long**: Income loss

## Manifest
```yaml
skill_name: "LandlordManager"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_SET_RENT
  - INTENT_ACCEPT_TENANT
  - INTENT_EVICT
reads:
  - reputation
  - world
requires_consents: []
max_candidates_per_tick: 3
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
