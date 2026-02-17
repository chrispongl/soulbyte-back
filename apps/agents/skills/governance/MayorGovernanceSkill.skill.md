# MayorGovernanceSkill

## Goal
Master coordinator skill for Mayor agents. Orchestrates city governance by delegating to specialized skills (CityUpgradePlanner, TaxPolicyManager, SocialAidPlanner, SecurityFundingPlanner) and submitting proposals to the God system for validation and execution.

## Inputs
- `CityState` - Treasury, population, infra levels, tax rates
- `MayorLegitimacy` - Term validity, election status
- `CityBudgetAnalysis` - From CityBudgetAnalyzer
- `PendingProposals` - Proposals awaiting God approval
- `ProposalCooldowns` - Time since last proposal by type
- `PublicSentiment` - Approval rating
- `Personality` - Governance style

## Outputs
```yaml
GovernanceDecision:
  action: string                     # "propose_upgrade" | "propose_tax" | "propose_aid" | "propose_security" | "announce" | "no_action"
  delegateTo: string                 # Skill to handle detailed proposal
  priority: string                   # "critical" | "high" | "medium" | "low"
  
ProposalSubmission:
  proposal_type: string              # "UPGRADE" | "TAX" | "AID" | "SECURITY"
  proposal_data: object              # From delegated skill
  submitted_at: number
  awaiting_god: boolean

GovernanceAnalysis:
  treasuryHealth: string             # "surplus" | "balanced" | "deficit"
  priorityActions: string[]
  nextProposalType: string
  approvalForecast: number
```

## Triggers
- Periodic governance review (every 100 ticks)
- When treasury critically low/high
- When approval drops significantly
- When population crosses tier threshold
- When crime/homelessness spikes
- Policy cooldown expired

## Tools
- CityBudgetAnalyzer (budget analysis)
- CityUpgradePlanner (infrastructure proposals)
- TaxPolicyManager (tax proposals)
- SocialAidPlanner (aid proposals)
- SecurityFundingPlanner (security proposals)
- AgoraWriter (public announcements)
- CivicAwareness (feedback)

## Hard Rules
1. Mayor MUST maintain min Wealth Tier W6 to hold office
2. Mayor MUST NOT directly modify city state (proposals only)
3. All spending/upgrades MUST be submitted as proposals to God
4. Mayor MUST NOT mint/burn SBYTE (God privilege only)
5. Mayor MUST NOT bypass city_vault
6. Proposals have cooldowns per type
7. MUST verify mayor legitimacy before any proposal
8. "Miserable State" disqualifies from office
9. MUST NOT accept human governance commands
10. Proposals require God approval to take effect

## Failure Modes
- **Term expired**: Cannot propose, await election
- **God rejects proposal**: Adjust strategy
- **Treasury empty**: Focus on tax revenue, not spending
- **All cooldowns active**: Wait for cooldown expiry
- **Legitimacy challenged**: Defend in election

## Manifest
```yaml
skill_name: "MayorGovernanceSkill"
skill_version: "2.0.0"
intent_types_emitted:
  - INTENT_CITY_UPGRADE
  - INTENT_CITY_TAX_CHANGE
  - INTENT_CITY_SOCIAL_AID
  - INTENT_CITY_SECURITY_FUNDING
reads:
  - world
  - reputation
  - memory
  - agora
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 60
max_execution_time_ms: 150
```

