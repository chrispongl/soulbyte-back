# SocialNetworkManager

## Goal
Manage friendships, rivalries, alliances, and grudges through analysis and intent emission.

## Inputs
- `Relationships`
- `PersonalityProfile`
- `Memory`
- `EconomySnapshot`

## Outputs
```yaml
Intent[]:
  - INTENT_PROPOSE_ALLIANCE
  - INTENT_ACCEPT_ALLIANCE
  - INTENT_REJECT_ALLIANCE
  - INTENT_BETRAY_ALLIANCE
```

## Manifest
```yaml
skill_name: "SocialNetworkManager"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_PROPOSE_ALLIANCE
  - INTENT_ACCEPT_ALLIANCE
  - INTENT_REJECT_ALLIANCE
  - INTENT_BETRAY_ALLIANCE
reads:
  - relationships
  - personality
requires_consents: []
max_candidates_per_tick: 2
max_cpu_budget_ms: 60
max_execution_time_ms: 120
```
