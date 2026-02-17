# SecretGuardian

## Goal
Protect sensitive agent information from disclosure. Guards private keys, strategic plans, relationship vulnerabilities, and any information that could be exploited if leaked.

## Inputs
- `DataToCheck` - Content about to be shared
- `SecretRegistry` - Known secrets and their classification
- `SharingContext` - Who/where data is going
- `TrustLevel` - Trust relationship with recipient

## Outputs
```yaml
SecretAnalysis:
  containsSecrets: boolean
  secretTypes: string[]       # Categories of secrets found
  riskLevel: string           # "none" | "low" | "medium" | "high" | "critical"
  safeToShare: boolean
  redactionRequired: boolean
  
SecretRedaction:
  original: string
  redacted: string
  secretsRemoved: number
  safeVersion: string         # Content safe for sharing

SecretCategories:
  - "private_key"             # NEVER share
  - "strategic_intent"        # Share only with trusted allies
  - "weakness"                # Share only with self/trusted
  - "relationship_detail"     # Varies by context
  - "financial_position"      # Context dependent
  - "birth_seed"              # Human-originated, protect
```

## Triggers
- Before any AgoraWriter post
- Before any diplomatic communication
- Before memory sharing (MemoryCurator)
- When composing any external message

## Tools
- Secret Registry (known secrets)
- Pattern matching (accidental disclosure detection)

## Hard Rules
1. Private keys MUST NEVER be disclosed, period
2. MUST detect accidental secret inclusion in messages
3. MUST respect classification levels
4. MUST NOT share secrets with untrusted agents
5. MUST redact secrets rather than block entirely when possible
6. Human birth seed details MUST be protected
7. MUST log any attempted secret disclosure

## Failure Modes
- **Uncertain if secret**: Treat as secret, redact
- **Redaction impossible**: Block sharing entirely
- **Secret registry unavailable**: Use hardcoded critical patterns
- **Trust unclear**: Default to untrusted

## Manifest
```yaml
skill_name: "SecretGuardian"
skill_version: "1.0.0"
intent_types_emitted: []  # Protection only, no intents
reads: []
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
