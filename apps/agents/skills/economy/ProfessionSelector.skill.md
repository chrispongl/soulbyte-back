# ProfessionSelector

## Goal
Evaluate available professions and select/switch the agent's active profession based on personality, skills, market conditions, and current needs. Manages profession progression, specialization, and **public sector employment** at government facilities.

## Inputs
- `Personality` - Affects profession affinity
- `CurrentProfession` - Active profession if any
- `SkillLevels` - Learned abilities and their levels
- `MarketData` - Demand/supply for each profession
- `Memory` - Past profession experiences
- `Balance` - Economic resources available
- `PublicPlaces` - Available government facilities (Hospital, School, Police)
- `PublicExperience` - Days of public sector experience
- `EconomicGuidance` - Burn rate vs. salary evaluation

## Outputs
```yaml
ProfessionAnalysis:
  currentProfession: string | null
  professionLevel: number          # 1-100 expertise
  availableProfessions: string[]   # What agent qualifies for
  recommendedProfession: string    # Best fit based on analysis
  switchReason: string | null      # Why to switch, if applicable
  publicRolesAvailable: string[]   # Eligible public roles based on experience
  
ProfessionIntent:
  action: "stay" | "switch" | "specialize" | "apply_public" | "resign_public"
  targetProfession: string
  confidence: number
  estimatedIncome: number         # Projected earnings

PublicEmploymentIntent:
  action: "apply" | "resign"
  facilityType: "HOSPITAL" | "SCHOOL" | "POLICE_STATION"
  role: "DOCTOR" | "NURSE" | "TEACHER" | "POLICE_OFFICER"
  expectedSalary: number
```

## Triggers
- At agent birth (initial profession selection)
- Every 100 ticks (evaluate if switch is beneficial)
- On major life event (profession blocked, market crash)
- When public job vacancy appears
- Never forced by humans

## Tools
- MarketData API (read-only)
- MemoryManager (recall past profession performance)
- PublicPlaceRegistry (available positions)

## Hard Rules
1. MUST NOT accept jobs below Wealth Tier restriction (W0=Begging, W5=Executive)
2. "Miserable State" (Status≤5) MUST block all work interactions
3. W0-W1 agents MUST be restricted to Menial/Labor roles
4. Higher tier jobs require proof of competence (Wealth Tier)
5. MUST NOT switch professions frequently (mastery loss)
6. MUST NOT accept human commands for profession change
7. Unemployment logic applies if eligible jobs unavailable - no free upgrades

### Public Employment Rules (NEW)
8. **Experience Requirements:**
   - Nurse/Police Officer: 0 days experience
   - Teacher: 10 days public experience
   - Doctor: 30 days public experience
9. **Daily Salaries (SBYTE):**
   - Doctor: 20
   - Teacher: 12
   - Nurse: 5
   - Police Officer: 5
10. **Work Hours per Day:**
    - Doctor: 3 hours
    - Teacher: 4 hours
    - Nurse: 5 hours
    - Police Officer: 5 hours
11. **Activity Blocking:** While WORKING, agent cannot emit other intents
12. **One public job at a time** per agent

## Failure Modes
- **No valid profession**: Fall back to basic "Worker" profession
- **Skill requirements not met**: Stay in current profession
- **Market data unavailable**: Use cached data or stay conservative
- **Conflicting personality**: Weight most dominant trait
- **Experience insufficient for public role**: Reject application

## Manifest
```yaml
skill_name: "ProfessionSelector"
skill_version: "2.0.0"
intent_types_emitted:
  - INTENT_CHANGE_PROFESSION
  - INTENT_APPLY_PUBLIC_JOB
  - INTENT_RESIGN_PUBLIC_JOB
  - INTENT_WORK
reads:
  - personality
  - memory
  - world
  - public_places
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
