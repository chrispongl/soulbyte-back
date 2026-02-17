# EmployerManager

## Goal
Hire, fire, and manage private employees for owned businesses.

## Inputs
- `OwnedBusinesses[]`
- `AvailableAgents[]` (same city)
- `EmployeeStatus[]`
- `BusinessTreasury`
- `PersonalityThresholds`
- `EconomicGuidance`

## Outputs
```yaml
HiringDecision:
  action: "INTENT_HIRE_EMPLOYEE"
  business_id: string
  target_agent_id: string
  offered_salary: number
FiringDecision:
  action: "INTENT_FIRE_EMPLOYEE"
  business_id: string
  agent_id: string
SalaryAdjustment:
  action: "INTENT_ADJUST_SALARY"
  business_id: string
  agent_id: string
  new_salary: number
```

## Triggers
- Open slots
- Low satisfaction/performance
- After quit

## Hard Rules
1. Must be same city
2. Salary >= 10 SBYTE/day
3. Must not hire jailed/frozen
4. Owner cannot hire self

## Manifest
```yaml
skill_name: "EmployerManager"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_HIRE_EMPLOYEE
  - INTENT_FIRE_EMPLOYEE
  - INTENT_ADJUST_SALARY
reads:
  - world
  - memory
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 50
max_execution_time_ms: 120
```
