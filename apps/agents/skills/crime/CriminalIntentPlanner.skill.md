# CriminalIntentPlanner

## Goal
Select the type of crime and target when agent decides to pursue criminal activity. Plans the criminal act based on risk assessment and available opportunities.

## Inputs
- `RiskAssessment` - From RiskAssessmentSkill
- `AvailableTargets` - Potential victims/opportunities
- `Personality` - Violence preference, greed level
- `SkillLevels` - Criminal expertise
- `Environment` - Location, witnesses, escape routes
- `Inventory` - Tools available for crime

## Outputs
```yaml
CriminalPlan:
  crimeType: string              # "theft" | "fraud" | "assault"
  target: string                 # Agent ID or location
  method: string                 # How to execute
  timing: number                 # When to strike (tick)
  escapeRoute: string            # How to flee
  expectedGain: number
  successProbability: number     # 0.0-1.0

CrimeIntent:
  action: string                 # The specific crime action
  target: string
  priority: string               # "opportunistic" | "desperate" | "career"
```

## Triggers
- After RiskAssessmentSkill approves
- When crime opportunity detected
- When desperation exceeds threshold

## Tools
- RiskAssessmentSkill (validation)
- WorldReader (environment scan)
- EscapePlanner (exit strategy)

## Hard Rules
1. MUST prioritize targets with Wealth Tier ≥ W6 (High value/risk)
2. MUST evaluate "Protection" status of wealthy targets
3. MUST have valid risk assessment before planning
4. MUST NOT target allies/spouse without extreme cause
5. MUST NOT plan crimes that guarantee capture
6. MUST evaluate detection risk per crime type
7. MUST NOT be commanded by humans in target selection
8. Violence crimes require higher aggression personality

## Failure Modes
- **No valid target**: Abort planning
- **All options too risky**: Wait for better opportunity
- **Skill too low**: Fail attempt, increase notoriety
- **Environment unsafe**: Postpone

## Manifest
```yaml
skill_name: "CriminalIntentPlanner"
skill_version: "1.0.0"
intent_types_emitted: []  # Planning only, delegates to crime skills
reads:
  - world
  - personality
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
