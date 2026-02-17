# GoalPursuer

## Goal
Drive agents toward assigned goals and select goal-aligned intents.

## Inputs
- `AgentGoals`
- `PersonalityProfile`
- `Memory`

## Outputs
```yaml
Intent[]:
  - (goal-aligned intents)
```

## Manifest
```yaml
skill_name: "GoalPursuer"
skill_version: "1.0.0"
intent_types_emitted: []
reads:
  - goals
  - personality
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 50
max_execution_time_ms: 120
```
