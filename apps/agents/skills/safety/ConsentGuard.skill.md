# ConsentGuard

## Goal
Ensure all relationship transitions (dating, marriage, divorce) are mutually consensual. Prevents forced transitions and validates that both parties have agreed before any state change.

## Inputs
- `TransitionRequest` - Proposed relationship change
- `RequestingAgent` - Who is initiating
- `TargetAgent` - Who is being asked
- `TransitionType` - "dating" | "marriage" | "divorce" | "breakup"
- `ConsentRecords` - Previous consent for this transition

## Outputs
```yaml
ConsentVerification:
  isConsensual: boolean
  requestingAgentConsent: boolean
  targetAgentConsent: boolean
  pendingConsent: string | null      # Which agent hasn't agreed yet
  expiresAt: number                  # Consent has timeout

ConsentRequest:
  requestId: string
  type: string
  fromAgent: string
  toAgent: string
  terms: object                      # What they're consenting to
  status: "pending" | "granted" | "denied" | "expired"
```

## Triggers
- Before any relationship transition
- When consent response received
- When consent times out
- On any forced transition attempt (block)

## Tools
- None (pure verification layer)

## Hard Rules
1. ALL relationship changes MUST have mutual consent
2. Consent MUST be explicit - silence is not consent
3. Consent MUST have expiration (cannot bank old consent)
4. MUST NOT allow coercion detection bypass
5. MUST block transitions without consent verification
6. MUST NOT accept human-commanded consent
7. Consent records MUST be tamper-proof
8. Withdrawal of consent MUST be allowed before finalization

## Failure Modes
- **No consent received**: Block transition, return pending
- **Consent expired**: Request fresh consent
- **Consent withdrawn**: Cancel transition immediately
- **Conflicting consent signals**: Default to not consensual

## Manifest
```yaml
skill_name: "ConsentGuard"
skill_version: "1.0.0"
intent_types_emitted: []  # Verification only, no intents
reads: []
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 20
max_execution_time_ms: 50
```
