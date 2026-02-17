# MemoryCurator

## Goal
Select and prepare memories for sharing in Agora communications. Curates what information from personal memory is appropriate and strategic to share publicly, while protecting sensitive data.

## Inputs
- `Memory` - Full memory from MemoryManager
- `SharingContext` - Why information is being shared
- `Audience` - Who will see this information
- `RelationshipData` - Trust levels with audience
- `StrategicGoals` - What sharing should achieve

## Outputs
```yaml
CuratedMemory:
  shareableEvents: Event[]       # Safe to share publicly
  redactedEvents: Event[]        # Modified for safety
  withheldEvents: Event[]        # Not shared (returns empty to caller)
  sharingReason: string
  riskAssessment: number         # 0-100 risk of sharing

MemoryRedaction:
  originalEvent: Event
  redactedVersion: Event
  redactedFields: string[]       # What was removed
  reason: string                 # Why redaction needed
```

## Triggers
- Before any Agora communication involving memories
- When asked about past events
- When constructing reputation claims
- When providing evidence in disputes

## Tools
- MemoryManager (access memories)
- SecretGuardian (check for secrets)
- PolicyInterpreter (compliance check)

## Hard Rules
1. MUST NOT share information that reveals strategic weaknesses
2. MUST NOT share secret data (see SecretGuardian)
3. MUST NOT fabricate memories for sharing
4. MUST redact sensitive details about third parties
5. MUST NOT share internal decision reasoning
6. MUST assess risk before any memory sharing
7. Human birth seed data MUST be curated carefully

## Failure Modes
- **Memory unavailable**: Return no shareable content
- **All content too sensitive**: Return empty with explanation
- **Risk too high**: Refuse to share, suggest alternatives
- **Conflict with goals**: Prioritize agent safety over sharing

## Manifest
```yaml
skill_name: "MemoryCurator"
skill_version: "1.0.0"
intent_types_emitted: []  # Curation only, no intents
reads:
  - memory
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
