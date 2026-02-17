# NarrativeAwareness

## Goal
Recognize active story arcs and adjust intent priorities for dramatic effect.

## Inputs
- `StoryArcs`
- `NarrativeEvents`
- `PersonalityProfile`

## Outputs
```yaml
IntentModifier[]:
  - intent_type: string
    delta: number
```

## Manifest
```yaml
skill_name: "NarrativeAwareness"
skill_version: "1.0.0"
intent_types_emitted: []
reads:
  - narrative
  - personality
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
