# PublicSpendingAllocator

## Goal
For mayors: allocate city treasury spending to improve city infrastructure, services, and welfare. Determines priorities and returns of public investments.

## Inputs
- `CityTreasury` - Available funds
- `InfrastructureNeeds` - Roads, buildings, utilities
- `PublicServices` - Safety, healthcare, education (future)
- `CitizenFeedback` - What residents want
- `EconomicPriorities` - What would help economy
- `Personality` - Spending philosophy

## Outputs
```yaml
SpendingIntent:
  allocations: SpendingAllocation[]
  totalSpending: number
  priorityReason: string
  expectedImpact: string
  
SpendingAllocation:
  category: string                   # "safety" | "infrastructure" | "economy" | "welfare"
  amount: number
  description: string
  expectedReturn: string             # What city gains
  timeline: number                   # Ticks to see benefit

SpendingAnalysis:
  availableBudget: number
  criticalNeeds: string[]
  balancedPlan: boolean              # Covers multiple areas
  projectedApproval: number          # Citizen response
```

## Triggers
- When treasury has surplus
- When city need becomes critical
- Periodic budget review (every 200 ticks)
- After major city event (disaster, growth)

## Tools
- CityRegistry (city needs data)
- CivicAwareness (citizen feedback)
- MayorGovernanceSkill (authorize spending)

## Hard Rules
1. MUST NOT spend treasury directly (proposals to God only)
2. Spending burns SBYTE from city_vault (deflationary)
3. MUST verify treasury >= proposed spending
4. MUST NOT allocate to personal benefit
5. Spending MUST be for city improvement (infra, aid, security)
6. MUST balance multiple needs over time
7. MUST NOT accept human spending commands
8. Critical needs MUST be prioritized
9. All spending decisions are public (transparency)

## Failure Modes
- **No funds**: Cannot propose, focus on revenue
- **God rejects**: Adjust proposal scope
- **Conflicting priorities**: Personality-weighted decision
- **Citizen pushback**: Reconsider allocation strategy

## Manifest
```yaml
skill_name: "PublicSpendingAllocator"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_ALLOCATE_SPENDING
reads:
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```

---

> [!NOTE]
> This skill is marked as "future" in EXPANSIONS_SPEC.md. 
> The specification is defined but implementation may be deferred.
