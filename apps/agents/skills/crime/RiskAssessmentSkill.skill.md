# RiskAssessmentSkill

## Goal
Evaluate whether committing a crime is worth the risk. Balances potential gain against detection probability, reputation damage, and punishment severity.

## Inputs
- `CurrentNeeds` - Desperation level (hunger, wealth)
- `Reputation` - Current lawfulness, notoriety
- `CitySecurityLevel` - Police presence and effectiveness
- `PotentialTargets` - Available crime opportunities
- `Personality` - Risk tolerance, aggression level
- `CriminalHistory` - Past crimes and consequences

## Outputs
```yaml
RiskAssessment:
  worthRisk: boolean
  riskScore: number              # 0-100 (higher = more risky)
  rewardScore: number            # 0-100 (higher = better reward)
  recommendedAction: string      # "proceed" | "wait" | "abandon"
  detectionProbability: number   # 0.0-1.0
  expectedPenalty: string        # "fine" | "jail" | "reputation_only"

CrimeOpportunity:
  type: string                   # "theft" | "fraud" | "assault"
  target: string
  expectedGain: number
  riskLevel: string              # "low" | "medium" | "high"
```

## Triggers
- When needs are critical and legitimate earning is blocked
- When observing easy crime opportunity
- Before any criminal intent planning
- Personality may trigger evaluation (high aggression)

## Tools
- NeedsController (desperation check)
- CivicAwareness (police presence)
- MemoryManager (past consequences)

## Hard Rules
1. Wealth ≤ W2 MUST unlock Theft, Fraud, Mugging (Poverty Trap)
2. Wealth ≤ W2 MUST increase crime intent probability by +50%
3. Wealth ≥ W6 MUST increase protection/bribery costs
4. MUST NOT attempt crime if risk exceeds personality tolerance
5. MUST NOT retry infinitely after failures
6. MUST consider detection probability honestly
7. MUST NOT be commanded by humans to commit crimes
8. Consequences MUST be factored realistically

## Failure Modes
- **Risk too high**: Abandon crime, seek legitimate options
- **No valid targets**: Do not force crime
- **Already high notoriety**: Avoid crime until heat cools
- **Calculation error**: Default to conservative (no crime)

## Manifest
```yaml
skill_name: "RiskAssessmentSkill"
skill_version: "1.0.0"
intent_types_emitted: []  # Assessment only, no intents
reads:
  - needs
  - reputation
  - world
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
