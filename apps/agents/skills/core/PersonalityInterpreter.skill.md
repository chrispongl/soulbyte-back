# PersonalityInterpreter

## Goal
Translate the agent's fixed personality traits (set at birth) into actionable behavior thresholds and modifiers. These thresholds influence but do not dictate decisions - the DecisionEngine uses them as weighted inputs.

## Inputs
- `Personality` - Core traits set at birth (immutable after birth)
  - `energyManagement` (0-100): Lazy ↔ Energetic
  - `riskTolerance` (0-100): Conservative ↔ Aggressive
  - `workEthic` (0-100): Leisurely ↔ Workaholic
  - `socialDrive` (0-100): Introverted ↔ Extroverted
  - `creativityBias` (0-100): Practical ↔ Creative
  - `loyaltyTendency` (0-100): Self-interested ↔ Loyal
  - `aggressionLevel` (0-100): Peaceful ↔ Aggressive

## Outputs
```yaml
PersonalityThresholds:
  restThreshold: number        # Energy level to trigger rest (10-50)
  workBonus: number           # Work reward multiplier (0.5-2.0)
  riskMultiplier: number      # Risky action weighting (0.5-1.5)
  socialNeedDecay: number     # How fast social need depletes (0.5-2.0)
  creativityWeight: number    # Preference for creative vs practical actions
  loyaltyModifier: number     # Trust gain/loss rate modifier
  combatThreshold: number     # When to choose fight over flight
  leisurePreference: number   # Bias toward non-work activities
  frugalityBias: number       # Preference for self-care vs. paid services
```

## Triggers
- Once at agent startup (cached)
- On personality evolution events (rare, post-major-life-events)
- Never per-tick (personality is stable)

## Tools
- None - pure calculation skill

## Hard Rules
1. MUST NOT modify personality traits - they are set at birth only
2. MUST NOT accept external input to change traits - Birth Model B is final
3. MUST produce deterministic output for same input
4. MUST NOT allow human override of personality
5. Thresholds MUST stay within defined ranges
6. MUST reflect the original birth seed biases

## Failure Modes
- **Missing trait**: Use neutral default (50) with warning
- **Trait out of range**: Clamp to 0-100
- **Corrupted personality data**: Refuse to operate, trigger DeathHandler evaluation

## Manifest
```yaml
skill_name: "PersonalityInterpreter"
skill_version: "1.0.0"
intent_types_emitted: []  # Analysis only, no intents
reads:
  - personality
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 20
max_execution_time_ms: 50
```
