# SecurityFundingPlanner

## Goal
Analyze city security needs and generate security funding proposals for the MayorGovernanceSkill. This is an **analysis-only skill** - it does NOT emit intents directly. MayorGovernanceSkill is the sole emitter of governance intents.

## Inputs
- `CityState` - Current security_level, crime_rate, treasury
- `CrimeStats` - Recent crime incidents, crime types, hotspots
- `PoliceEffectiveness` - Current patrol coverage, arrest rates
- `SecurityCosts` - Cost per security level upgrade
- `PopulationDensity` - Areas needing coverage
- `CityReputation` - Safety component of reputation

## Outputs
```yaml
SecurityProposal:
  city_id: string
  funding_type: string           # "patrol_expansion" | "security_upgrade" | "crime_prevention"
  current_level: number
  target_level: number
  estimated_cost: number
  expected_crime_reduction: number  # Percentage reduction
  priority_areas: string[]
  justification: string

SecurityAnalysis:
  crime_severity: string         # "low" | "moderate" | "high" | "critical"
  security_gaps: string[]        # Underserved areas
  recommended_funding: number
  roi_estimate: string           # Return on investment
  citizen_safety_score: number   # 0-100
```

## Triggers
- When crime_rate exceeds threshold
- After major crime event (mugging spike, fraud wave)
- Periodic security review (every 200 ticks)
- When citizen safety complaints rise
- When wealthy agents (W6+) leave due to crime
- **On request from MayorGovernanceSkill**

## Tools
- CivicAwareness (crime statistics)
- CityBudgetAnalyzer (funding constraints)
- AgoraReader (citizen safety concerns)

## Hard Rules
1. Security funding MUST be proposed to God
2. MUST verify treasury >= funding cost
3. MUST NOT target specific criminal agents
4. Security level has diminishing returns
5. MUST consider balance with social aid (security alone doesn't fix root causes)
6. MUST NOT bypass population thresholds for upgrades
7. Funding proposals require God validation
8. Over-funding security may reduce funds for other needs
9. **MUST NOT emit intents - output proposals for MayorGovernanceSkill to consume**

## Failure Modes
- **Treasury insufficient**: Defer, propose tax increase
- **Security at max level**: Cannot improve further
- **Crime persists**: Root cause may be poverty, not policing
- **God rejects**: Adjust proposal scope

## Manifest
```yaml
skill_name: "SecurityFundingPlanner"
skill_version: "2.0.0"
intent_types_emitted: []        # Analysis only - MayorGovernanceSkill emits intents
reads:
  - world
  - memory
requires_consents: []
max_candidates_per_tick: 0      # Analysis only
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
