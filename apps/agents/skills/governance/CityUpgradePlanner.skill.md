# CityUpgradePlanner

## Goal
Analyze city infrastructure needs and generate upgrade proposals for the MayorGovernanceSkill. This is an **analysis-only skill** - it does NOT emit intents directly. MayorGovernanceSkill is the sole emitter of governance intents.

## Inputs
- `CityState` - Current city parameters (population, treasury, infra levels)
- `PopulationThresholds` - Unlock requirements for each infra tier
- `UpgradeCosts` - Estimated costs per upgrade type
- `CityNeeds` - Priority areas (housing, security, health, entertainment, transport)
- `MayorLegitimacy` - Current term validity
- `PendingProposals` - Already submitted proposals awaiting God approval

## Outputs
```yaml
UpgradeProposal:
  city_id: string
  upgrade_type: string           # "housing" | "jobs" | "security" | "health" | "entertainment" | "transport"
  current_level: number
  requested_level: number
  estimated_cost: number
  justification: string
  priority: string               # "critical" | "high" | "medium" | "low"
  population_requirement: number
  treasury_after_cost: number

UpgradeAnalysis:
  eligible_upgrades: UpgradeOption[]
  blocked_upgrades: BlockedUpgrade[]
  recommended_next: string       # Best upgrade to propose
  treasury_headroom: number
```

## Triggers
- Periodic city review (every 200 ticks)
- When population crosses threshold
- When treasury surplus detected
- When city reputation drops significantly
- On request from CivicAwareness
- **On request from MayorGovernanceSkill**

## Tools
- CivicAwareness (city health data)
- CityBudgetAnalyzer (treasury analysis)
- MemoryManager (past upgrade outcomes)

## Hard Rules
1. MUST verify population >= threshold for upgrade tier
2. MUST verify treasury_balance >= estimated_cost
3. MUST NOT propose conflicting upgrades simultaneously
4. MUST verify mayor legitimacy before generating proposals
5. MUST NOT mint/burn SBYTE (only God can)
6. MUST NOT bypass vault (proposals only)
7. Proposals MUST include justification
8. MUST respect upgrade max levels
9. **MUST NOT emit intents - output proposals for MayorGovernanceSkill to consume**

## Failure Modes
- **Treasury insufficient**: Defer proposal, flag need for higher taxes
- **Population below threshold**: Cannot propose, wait for growth
- **Mayor term expired**: Cannot generate proposals
- **Upgrade at max level**: Skip to next priority

## Manifest
```yaml
skill_name: "CityUpgradePlanner"
skill_version: "2.0.0"
intent_types_emitted: []        # Analysis only - MayorGovernanceSkill emits intents
reads:
  - world
  - memory
requires_consents: []
max_candidates_per_tick: 0      # Analysis only
max_cpu_budget_ms: 50
max_execution_time_ms: 100
```
