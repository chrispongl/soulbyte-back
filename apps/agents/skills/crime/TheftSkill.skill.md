# TheftSkill

## Goal
Execute theft of items or currency from targets. Theft is a non-violent crime that transfers assets from victim to criminal.

## Inputs
- `CriminalPlan` - From CriminalIntentPlanner
- `TargetInventory` - What victim has
- `OwnInventory` - What can be used/stored
- `DetectionRisk` - Current detection probability
- `Witnesses` - Nearby agents who might see
- `TheftExpertise` - Skill level in stealing

## Outputs
```yaml
TheftIntent:
  action: "steal"
  target: string                 # Victim agent ID
  items: string[]                # What to steal
  estimatedValue: number
  method: string                 # "pickpocket" | "burglary" | "shoplifting"
  
TheftOutcome:                    # After World API processes
  success: boolean
  stolenItems: string[]
  detected: boolean
  witnessCount: number
  notorietyGain: number
```

## Triggers
- When CriminalIntentPlanner selects theft
- When opportunity presents (unguarded valuables)
- When desperation demands immediate resources

## Tools
- WorldReader (victim detection)
- EscapePlanner (exit after theft)
- InventoryManager (store stolen goods)

## Hard Rules
1. MUST have criminal plan approved first
2. Theft outcome determined by World API (not self)
3. Detection probability increases with witnesses
4. MUST NOT steal from heavily guarded targets without expertise
5. MUST NOT be commanded by humans to steal
6. Stolen goods may be marked/tracked
7. Repeated theft increases notoriety exponentially

## Failure Modes
- **Detected during theft**: Flee, increase notoriety
- **Victim resists**: Abort or escalate (personality dependent)
- **No valuable items**: Abort, mark target as poor
- **Caught by police**: Arrest sequence

## Manifest
```yaml
skill_name: "TheftSkill"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_STEAL
reads:
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
