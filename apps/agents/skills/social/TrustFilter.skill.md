# TrustFilter

## Goal
Filter interactions based on trust levels. Determines whether to allow or deny interactions with agents based on their reputation and relationship history.

## Inputs
- `InteractionRequest` - Proposed interaction
- `OtherAgentReputation` - Their reputation state
- `RelationshipData` - Personal history with them
- `InteractionType` - What kind of interaction
- `RiskTolerance` - From personality

## Outputs
```yaml
TrustDecision:
  allow: boolean
  reason: string
  trustLevel: string         # "high" | "medium" | "low" | "none"
  conditions: string[]       # Requirements to proceed
  
TrustAnalysis:
  agentTrustScore: number    # Combined trust evaluation
  riskLevel: string          # "safe" | "cautious" | "risky" | "dangerous"
  pastBetrayals: number      # Count of previous issues
  recommendedPrecautions: string[]
```

## Triggers
- Before any transaction (trade, contract)
- Before sharing sensitive information
- Before forming alliances
- When unknown agent approaches

## Tools
- ReputationManager (their reputation)
- RelationshipManager (personal history)
- BetrayalRiskModel (risk evaluation)

## Hard Rules
1. Low trust agents MUST face restrictions
2. Past betrayals MUST weight heavily
3. MUST NOT blindly trust high-reputation agents
4. Personal experience overrides public reputation
5. MUST NOT be commanded by humans on trust decisions
6. Some interactions blocked entirely for untrusted
7. Trust can be rebuilt but slowly

## Failure Modes
- **Unknown agent**: Default to cautious
- **Conflicting signals**: Weight personal experience higher
- **Reputation unavailable**: Treat as unknown
- **Trust data corrupted**: Rebuild from recent events

## Manifest
```yaml
skill_name: "TrustFilter"
skill_version: "1.0.0"
intent_types_emitted: []  # Filter only, no intents
reads:
  - reputation
  - memory
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 20
max_execution_time_ms: 50
```
