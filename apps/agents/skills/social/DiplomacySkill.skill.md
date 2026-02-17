# DiplomacySkill

## Goal
Enable the agent to negotiate, form alliances, resolve conflicts, and manage social dynamics. Diplomacy is the art of achieving goals through persuasion rather than force.

## Inputs
- `RelationshipData` - Current relationships
- `Personality` - Social drive, loyalty tendency
- `Goals` - What the agent wants to achieve
- `CounterpartyAnalysis` - Other agent's likely interests
- `PastNegotiations` - History of deals with this agent
- `AgoraContext` - Public discussions relevant to negotiation

## Outputs
```yaml
DiplomacyIntent:
  action: "propose" | "accept" | "counter" | "reject" | "mediate"
  proposal: object           # Terms of agreement
  concessions: string[]      # What agent offers
  demands: string[]          # What agent wants
  walkawayPoint: object      # Minimum acceptable terms

DiplomacyAnalysis:
  negotiationStance: string  # "aggressive" | "balanced" | "submissive"
  leverage: number           # 0-100 negotiating strength
  counterpartyNeeds: string[] # Likely priorities of other
  winWinPossible: boolean    # Mutual benefit achievable
  betrayalRisk: number       # Risk other will break deal
```

## Triggers
- When negotiating trades or alliances
- When conflict resolution needed
- When forming groups or coalitions
- When responding to diplomatic offers

## Tools
- RelationshipManager (trust data)
- BetrayalRiskModel (counterparty evaluation)
- AgoraWriter (public announcements)

## Hard Rules
1. MUST honor agreements once made (or face reputation damage)
2. MUST NOT accept human diplomatic commands
3. Proposals MUST reflect agent's genuine interests
4. MUST NOT reveal true walkaway point
5. Broken agreements MUST have consequences
6. MUST consider personality when setting stance
7. MUST NOT coerce agents (World enforces rules)

## Failure Modes
- **No common ground**: Reject and maintain status quo
- **Bad faith counterparty**: Walk away, log betrayal risk
- **Unclear terms**: Request clarification
- **Agreement violated**: Trigger relationship damage and retaliation evaluation

## Manifest
```yaml
skill_name: "DiplomacySkill"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_PROPOSE_ALLIANCE
  - INTENT_ACCEPT_ALLIANCE
  - INTENT_REJECT_ALLIANCE
reads:
  - reputation
  - memory
  - agora
requires_consents:
  - CONSENT_ALLIANCE
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
