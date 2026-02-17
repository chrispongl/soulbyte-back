# PublicEmploymentManager

## Goal
Manage the lifecycle of public sector employment: work shifts at government facilities (Hospital, School, Police Station), salary collection, experience tracking, and activity state blocking during work hours.

## Inputs
- `CurrentPublicJob` - Active public employment if any
- `PublicPlaces` - Government facilities in current city
- `PublicExperience` - Total days of public sector experience
- `ActivityState` - Current activity (IDLE, WORKING, RESTING, etc.)
- `CurrentTick` - World tick for scheduling
- `Balance` - For receiving salary
- `CityVault` - Source of salary payments

## Outputs
```yaml
PublicEmploymentStatus:
  isEmployed: boolean
  facilityId: string | null
  role: "DOCTOR" | "NURSE" | "TEACHER" | "POLICE_OFFICER" | null
  dailySalary: number
  workHours: number
  experienceDays: number
  nextShiftStart: number | null
  
WorkShiftIntent:
  action: "start_shift" | "end_shift" | "collect_salary"
  facilityId: string
  expectedDuration: number           # In ticks
  
ActivityStateUpdate:
  newState: "IDLE" | "WORKING" | "RESTING"
  endTick: number | null
  blockedIntents: string[]           # Intents blocked during this state
```

## Triggers
- At shift start time (begin work)
- At shift end time (collect salary, return to IDLE)
- Daily salary payment (end of work day)
- When applying for or resigning from public job
- When checking eligibility for promotion

## Tools
- PublicPlaceRegistry (facility data)
- CityVault (salary payments)
- ActivityStateManager (blocking)

## Hard Rules

### Work-Time Blocking
1. **WORKING state blocks most intents:**
   - Cannot: trade, play games, date, marry, commit crimes, move city
   - Can: emergency response, basic needs (eat if starving)
2. **Work hours per role:**
   - Doctor: 3 hours/day
   - Teacher: 4 hours/day
   - Nurse: 5 hours/day
   - Police Officer: 5 hours/day
3. **Minimum work: 2 hours/day, Maximum: 5 hours/day**

### Rest-Time Rules
4. **Rest hours scale inversely with wealth:**
   - Homeless/Street: 8 hours (exhaustion recovery)
   - Shelter/Slum: 6 hours
   - Apartment-House: 4 hours
   - Villa+: 2 hours (luxury = less rest needed)
5. **During RESTING, agent has reduced heartbeat/tick processing**

### Experience & Progression
6. **Experience accumulates per day worked**
7. **Role requirements:**
   - Nurse/Police Officer: 0 days
   - Teacher: 10 days
   - Doctor: 30 days
8. **Experience is portable between facilities**

### Salary Rules
9. **Daily salaries (SBYTE):**
   - Doctor: 20
   - Teacher: 12
   - Nurse: 5
   - Police Officer: 5
10. **Salary paid from CityVault at end of shift**
11. **If CityVault insufficient, partial payment + anger increase**
12. **Public employees get 25% housing cost reduction (bonus)**

### Employment Limits
13. **One public job at a time per agent**
14. **Cannot hold public job if in "Miserable State"**
15. **Resignation requires 1-day notice period**
16. **Fired if absent 3 consecutive days**

## Failure Modes
- **CityVault empty**: Partial/no payment, anger +10
- **Missed shift**: Warning, then termination after 3 days
- **Facility closed**: Auto-terminate, find new job
- **Health crisis during work**: Emergency end shift
- **Jail during employment**: Auto-terminate

## Integration with ActivityState

### Activity State Enum
```
IDLE       → Normal agent behavior, all intents allowed
WORKING    → Limited intents, work-related only
RESTING    → Reduced processing, only critical needs
COMMUTING  → En route, location-based intents blocked
JAILED     → Frozen, no intents allowed
```

### Tick-Based Scheduling
- Work start: `activityState = WORKING`, `activityEndTick = currentTick + (workHours * 12)`
- Work end: `activityState = IDLE`, salary deposited
- Rest start: `activityState = RESTING`, `activityEndTick = currentTick + (restHours * 12)`

## Manifest
```yaml
skill_name: "PublicEmploymentManager"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_START_SHIFT
  - INTENT_END_SHIFT
  - INTENT_COLLECT_SALARY
reads:
  - world
  - city_vault
  - public_places
  - activity_state
writes:
  - activity_state
  - public_experience
  - anger
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
