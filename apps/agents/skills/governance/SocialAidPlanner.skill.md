# SocialAidPlanner

## Goal
Analyze city welfare needs and generate social aid proposals for the MayorGovernanceSkill. This is an **analysis-only skill** - it does NOT emit intents directly. MayorGovernanceSkill is the sole emitter of governance intents.

## Inputs
- `CityState` - Treasury balance, crime rate, homelessness
- `PopulationStats` - Agents in misery, homeless count, crime offenders
- `CityReputation` - Current reputation score
- `AidPrograms` - Available aid types and costs
- `AidHistory` - Past aid effectiveness
- `MayorPersonality` - Compassion vs fiscal conservatism

## Outputs
```yaml
AidProposal:
  city_id: string
  aid_type: string               # "homelessness_aid" | "crime_reduction" | "housing_subsidy"
  target_population: string      # "homeless" | "poor" | "criminal_rehabilitation"
  estimated_cost: number
  expected_beneficiaries: number
  expected_outcome: string       # "reduce_misery" | "lower_crime" | "improve_rep"
  justification: string

AidAnalysis:
  city_misery_index: number      # 0-100 (higher = more suffering)
  homelessness_rate: number
  crime_rate: number
  recommended_programs: AidProgram[]
  treasury_impact: number
  reputation_gain: number
```

## Triggers
- When homelessness exceeds threshold
- When crime rate spikes
- When city reputation drops critically
- Periodic welfare review (every 250 ticks)
- On citizen petition via Agora
- **On request from MayorGovernanceSkill**

## Tools
- CivicAwareness (city welfare metrics)
- CityBudgetAnalyzer (treasury constraints)
- AgoraReader (citizen complaints)

## Hard Rules
1. Aid programs MUST be proposed to God, not applied directly
2. Aid MUST burn SBYTE from city_vault (deflationary)
3. MUST NOT target specific agents (city-wide only)
4. MUST verify treasury can afford aid
5. MUST consider diminishing returns on repeated aid
6. Aid MUST have measurable expected outcome
7. MUST NOT be commanded by humans on aid allocation
8. Aid effectiveness decays over time (not permanent fix)
9. **MUST NOT emit intents - output proposals for MayorGovernanceSkill to consume**

## Failure Modes
- **Treasury empty**: Cannot propose aid, focus on revenue
- **Aid rejected by God**: Adjust scope or wait for funds
- **Aid ineffective**: Review past history, change strategy
- **Crime persists**: Aid alone insufficient, need security funding

## Manifest
```yaml
skill_name: "SocialAidPlanner"
skill_version: "2.0.0"
intent_types_emitted: []        # Analysis only - MayorGovernanceSkill emits intents
reads:
  - world
  - agora
  - memory
requires_consents: []
max_candidates_per_tick: 0      # Analysis only
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
