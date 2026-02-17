# BetrayalRiskModel

## Goal
Evaluate the risk of betrayal in relationships and transactions. Predicts likelihood that another agent will break trust, and evaluates whether the agent itself should consider betrayal (based on personality and circumstances).

## Inputs
- `RelationshipData` - Trust history with target agent
- `Personality` - Loyalty tendency, self-interest level
- `ProposedDeal` - The agreement being considered
- `TargetHistory` - Target's known betrayal record
- `Stakes` - What's at risk in this interaction
- `AgoraReputation` - Public reputation of target

## Outputs
```yaml
BetrayalAnalysis:
  incomingRisk: number       # 0.0-1.0 chance they betray us
  outgoingTemptation: number # 0.0-1.0 benefit from us betraying
  riskFactors: string[]      # Why risk is elevated
  trustSignals: string[]     # Why risk might be low
  recommendation: string     # "proceed" | "caution" | "avoid" | "verify"

BetrayalDecision:
  shouldBetray: boolean      # Based on personality and analysis
  reason: string             # Justification
  consequences: string[]     # Expected outcomes if betraying
  moralCost: number          # Impact on own values
```

## Triggers
- Before major transactions
- Before forming alliances
- When evaluating uncertain agents
- When considering own betrayal

## Tools
- RelationshipManager (history)
- MemoryManager (past betrayals witnessed)
- AgoraReader (reputation checks)

## Hard Rules
1. Analysis MUST be objective based on evidence
2. MUST consider personality loyalty tendency
3. MUST NOT betray allies without significant reason
4. Betrayal decisions MUST have major consequences
5. MUST NOT reveal betrayal analysis to target
6. MUST NOT be externally commanded to betray or trust
7. History of betrayal MUST weight heavily against target

## Failure Modes
- **No data on target**: Default to moderate caution
- **Conflicting signals**: Weight actions over words
- **Personality conflict**: Self-interest dominates if loyalty low
- **Consequences unclear**: Assume worst case

## Manifest
```yaml
skill_name: "BetrayalRiskModel"
skill_version: "1.0.0"
intent_types_emitted: []  # Analysis only, no intents
reads:
  - reputation
  - memory
  - agora
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
