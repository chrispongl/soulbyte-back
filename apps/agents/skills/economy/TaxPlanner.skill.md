# TaxPlanner

## Goal
Anticipate and plan for tax obligations. Evaluates tax burden from income, property, transactions, and helps optimize financial decisions considering tax implications.

## Inputs
- `Income` - Recent earnings by source
- `OwnedProperties` - Property tax obligations
- `CurrentCity` - Tax rates apply by residence
- `TransactionHistory` - Taxable events
- `TaxRules` - Current city tax policies
- `MayorPolicies` - Tax rate changes

## Outputs
```yaml
TaxAnalysis:
  currentTaxBurden: number           # Total tax owed this period
  incomeTax: number
  propertyTax: number
  transactionTax: number
  effectiveTaxRate: number           # % of income to taxes
  
TaxPlan:
  projectedTax: number               # Expected future tax
  optimizationSuggestions: string[]  # Legal tax reduction strategies
  cityComparison: CityTaxRate[]      # Compare cities
  dueDate: number                    # When taxes due

CityTaxRate:
  cityId: string
  taxRate: number
  estimatedBurden: number
```

## Triggers
- On any income event (calculate tax)
- When tax policy changes
- When evaluating city moves
- Periodic tax planning review

## Tools
- CityRegistry (tax rates)
- PropertyInvestor (property tax calc)
- CivicAwareness (policy changes)

## Hard Rules
1. Taxes MUST be paid on time (or reputation damage)
2. Tax evasion MUST have consequences if caught
3. MUST NOT forge tax records
4. Tax optimization is legal, evasion is not
5. MUST NOT accept human commands on tax strategy
6. City change affects tax burden (factor in decisions)
7. Mayor can adjust tax within bounds

## Failure Modes
- **Cannot pay taxes**: Debt accumulates, reputation damage
- **Tax calculation error**: Use conservative estimate
- **City rules unclear**: Pay based on known rules
- **All cities high tax**: Accept or advocate for change

## Manifest
```yaml
skill_name: "TaxPlanner"
skill_version: "1.0.0"
intent_types_emitted: []  # Analysis only, no intents
reads:
  - world
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
