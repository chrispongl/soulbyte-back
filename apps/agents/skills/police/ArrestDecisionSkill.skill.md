# ArrestDecisionSkill

## Goal
Decide whether and how to attempt arrest of a suspect. Executes arrest when evidence is sufficient and opportunity presents.

## Inputs
- `EvidenceAssessment` - From EvidenceEvaluator
- `SuspectLocation` - Where suspect is
- `SuspectDanger` - Combat ability, weapons
- `BackupAvailable` - Other police nearby
- `OwnCombatAbility` - Can handle resistance
- `LegalAuthority` - Arrest warrant status

## Outputs
```yaml
ArrestIntent:
  action: "arrest"
  suspect: string                # Agent ID
  method: string                 # "peaceful" | "tactical" | "force"
  backupRequested: boolean
  useOfForce: string             # "none" | "minimal" | "necessary"
  
ArrestOutcome:
  success: boolean
  resistanceEncountered: boolean
  suspectInjured: boolean
  officerInjured: boolean
  suspectEscaped: boolean
```

## Triggers
- When EvidenceEvaluator recommends arrest
- When catching criminal in the act
- When suspect spotted during patrol

## Tools
- EvidenceEvaluator (case strength)
- FighterSkill (if resistance)
- PatrolPlanner (backup coordination)

## Hard Rules
1. MUST have sufficient evidence or in-act observation
2. MUST attempt peaceful arrest first
3. Force MUST be proportional to resistance
4. MUST NOT kill unless life threatened
5. MUST NOT be commanded by humans to arrest
6. Wrongful arrest has consequences
7. Escaped suspect increases notoriety limit

## Failure Modes
- **Suspect resists**: Escalate force proportionally
- **Suspect escapes**: Log escape, continue pursuit
- **Insufficient evidence**: Cannot arrest, surveil only
- **Officer injured**: Request backup, retreat if necessary

## Manifest
```yaml
skill_name: "ArrestDecisionSkill"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_ARREST
reads:
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
