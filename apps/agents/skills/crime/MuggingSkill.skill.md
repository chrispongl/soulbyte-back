# MuggingSkill

## Goal
Execute assault for profit (mugging). This is a violent crime that uses force or threat to extract valuables from victims.

## Inputs
- `CriminalPlan` - From CriminalIntentPlanner
- `Target` - Victim agent
- `CombatAbility` - Own fighting skill
- `TargetStrength` - Victim's combat capability
- `Witnesses` - Nearby agents
- `Personality` - Violence level, aggression

## Outputs
```yaml
MuggingIntent:
  action: "assault"
  target: string                 # Victim agent ID
  demandItems: string[]          # What demanding
  threatLevel: string            # "intimidate" | "weapon" | "attack"
  willingToKill: boolean         # Escalation limit
  
MuggingOutcome:
  success: boolean
  gainsObtained: object[]
  victimHealth: number           # Damage dealt
  detected: boolean
  violenceScore: number          # For reputation
```

## Triggers
- When CriminalIntentPlanner selects assault
- High aggression + desperation combination
- When non-violent options exhausted

## Tools
- FighterSkill (combat execution)
- EscapePlanner (flee after attack)
- RiskAssessmentSkill (target evaluation)

## Hard Rules
1. Assault MUST require higher aggression personality
2. Violence reputation dimension MUST increase
3. MUST avoid high-escalation unless personality extreme
4. Victim injury/death has severe consequences
5. MUST NOT be commanded by humans to assault
6. Permadeath applies if victim dies (major consequence)
7. Police response probability high for violence

## Failure Modes
- **Victim stronger**: Lose fight, take damage
- **Victim has allies**: Flee or face group
- **Police nearby**: Immediate arrest risk
- **Victim dies**: Murder charges, extreme notoriety

## Manifest
```yaml
skill_name: "MuggingSkill"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_ASSAULT
reads:
  - world
  - personality
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 50
max_execution_time_ms: 100
```
