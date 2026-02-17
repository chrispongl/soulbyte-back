# PersonalityAnalyzer

## Goal
Analyze agent personality traits and archetype to produce decision modifiers (analysis only).

## Inputs
- `Personality` (ambition, riskTolerance, sociability, lawfulness, vengefulness)
- `Emotions`
- `Memory`

## Outputs
```yaml
PersonalityProfile:
  archetype: string
  primary_drive: string
  risk_profile: string
  social_style: string
```

## Manifest
```yaml
skill_name: "PersonalityAnalyzer"
skill_version: "1.0.0"
intent_types_emitted: []
reads:
  - personality
  - memory
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
