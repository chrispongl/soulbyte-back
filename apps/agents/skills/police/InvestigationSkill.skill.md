# InvestigationSkill

## Goal
Analyze crime events to identify suspects. Gathers evidence from crime scenes and witness reports to build cases against criminals.

## Inputs
- `CrimeReports` - Reported crimes table
- `WitnessStatements` - Agent testimonies
- `CrimeSceneData` - Evidence from scenes
- `SuspectProfiles` - Known criminals
- `NotorietyRecords` - Agent notoriety levels
- `InvestigationSkillLevel` - Detective expertise

## Outputs
```yaml
Investigation:
  crimeId: string
  suspectList: Suspect[]
  evidenceStrength: number       # 0-100
  caseStatus: string             # "open" | "solved" | "cold"
  recommendedAction: string      # "arrest" | "surveil" | "close"

Suspect:
  agentId: string
  confidence: number             # 0-100 likelihood guilty
  evidence: string[]             # What links them
  motive: string | null
```

## Triggers
- When crime reported
- When new evidence discovered
- When witness comes forward
- Periodic review of open cases

## Tools
- CrimeRegistry (case data)
- ReputationManager (suspect history)
- MemoryManager (past investigations)

## Hard Rules
1. MUST base suspicion on evidence, not bias
2. Confidence MUST scale with evidence quality
3. MUST NOT frame innocent agents
4. MUST NOT arrest without sufficient evidence
5. MUST NOT be commanded by humans on suspects
6. Cold cases remain open indefinitely
7. False accusations damage police reputation

## Failure Modes
- **No evidence**: Case goes cold
- **Conflicting evidence**: Lower confidence all suspects
- **Witness unreliable**: Weight testimony less
- **Suspect dead**: Close case, no arrest possible

## Manifest
```yaml
skill_name: "InvestigationSkill"
skill_version: "1.0.0"
intent_types_emitted: []  # Investigation only, delegates to ArrestDecisionSkill
reads:
  - world
  - reputation
  - memory
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 50
max_execution_time_ms: 100
```
