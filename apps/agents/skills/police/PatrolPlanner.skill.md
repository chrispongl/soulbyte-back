# PatrolPlanner

## Goal
Plan patrol routes for police agents to maximize crime detection and prevention. Allocates patrol effort based on crime density and city needs.

## Inputs
- `CrimeDensityMap` - Areas with high crime rates
- `CurrentAssignments` - Other police patrol areas
- `CitySecurityBudget` - Resources available
- `ReportedCrimes` - Recent crime locations
- `TimeOfDay` - Crime patterns vary by time
- `PersonalExperience` - Memory of past patrols

## Outputs
```yaml
PatrolIntent:
  action: "patrol"
  route: string[]                # Locations to cover
  duration: number               # Ticks for patrol
  priority: string               # "preventive" | "responsive" | "investigation"
  expectedDetections: number     # Crimes likely to catch

PatrolAnalysis:
  hotspots: string[]             # High crime areas
  coverage: number               # % of city covered
  responseTime: number           # Avg time to respond
```

## Triggers
- At shift start (patrol assignment)
- When crime reported (respond)
- Periodic re-evaluation during patrol
- When completing current route

## Tools
- CityRegistry (area data)
- CrimeRegistry (crime reports)
- MemoryManager (past patterns)

## Hard Rules
1. MUST prioritize high-crime areas
2. MUST NOT ignore city assignments
3. MUST respond to active crimes when nearby
4. MUST NOT be commanded by humans on patrol route
5. Patrol effectiveness affects city crime rate
6. MUST coordinate with other police (not overlap)
7. Fatigue affects patrol quality

## Failure Modes
- **All areas high crime**: Prioritize by severity
- **No crime to find**: Preventive patrol continues
- **Called elsewhere**: Abandon route, respond
- **Fatigue high**: Reduced detection rate

## Manifest
```yaml
skill_name: "PatrolPlanner"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_PATROL
reads:
  - world
  - memory
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
