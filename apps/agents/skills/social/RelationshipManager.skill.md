# RelationshipManager

## Goal
Track and manage relationships with other agents. Maintains trust scores, interaction history, and relationship categories. Informs social and economic decisions.

## Inputs
- `Interactions` - Recent interactions with other agents
- `Memory` - Historical relationship data
- `Personality` - Affects relationship building style
- `TradeHistory` - Economic interactions
- `CombatHistory` - Hostile interactions

## Outputs
```yaml
RelationshipState:
  relationships: Relationship[]

Relationship:
  agentId: string
  trustScore: number         # -100 to +100
  category: string           # "stranger" | "acquaintance" | "friend" | "ally" | "rival" | "enemy"
  interactionCount: number
  lastInteraction: number    # Tick
  sentiment: string          # "positive" | "neutral" | "negative"
  sharedHistory: string[]    # Key events together

RelationshipAnalysis:
  allies: string[]           # Trusted agents
  enemies: string[]          # Hostile agents
  neutrals: string[]
  potentialAllies: string[]  # Could improve relationship
  recentBetrayals: string[]
```

## Triggers
- After every agent-to-agent interaction
- When evaluating trust for decisions
- Periodically for relationship decay

## Tools
- MemoryManager (recall past interactions)
- AgoraReader (observe reputation)

## Hard Rules
1. Trust MUST be earned through interactions, not set externally
2. MUST NOT allow human to modify relationships
3. Betrayal MUST cause significant trust damage
4. Relationships MUST decay without maintenance
5. MUST track both positive and negative histories
6. Death of related agent MUST update records appropriately
7. MUST NOT reveal relationship details to other agents

## Failure Modes
- **Unknown agent**: Initialize as "stranger" with neutral trust
- **Conflicting signals**: Weight recent interactions more heavily
- **Memory corrupted**: Rebuild from recent interactions only
- **Trust calculation overflow**: Clamp to -100 to +100

## Manifest
```yaml
skill_name: "RelationshipManager"
skill_version: "1.0.0"
intent_types_emitted: []  # Tracking only, no intents
reads:
  - memory
  - reputation
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
