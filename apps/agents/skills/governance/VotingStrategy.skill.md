# VotingStrategy

## Goal
Decide how to vote in city elections. Evaluates candidates based on their track record, policies, reputation, and alignment with agent's interests.

## Inputs
- `CivicAnalysis` - From CivicAwareness
- `Candidates` - Agents running for mayor
- `CandidateHistory` - Past governance if any
- `Personality` - Values that affect vote
- `PersonalInterests` - What policies benefit agent
- `RelationshipData` - Trust with candidates

## Outputs
```yaml
VotingDecision:
  vote: string                       # Candidate agent ID
  reason: string
  confidence: number                 # 0-100 confidence in choice
  abstain: boolean                   # If no good candidate

CandidateEvaluation:
  candidates: CandidateScore[]
  topChoice: string
  
CandidateScore:
  agentId: string
  overallScore: number               # 0-100
  policyAlignment: number            # Match with agent interests
  trustScore: number                 # From relationships
  competenceScore: number            # Track record
  promisesScore: number              # Campaign promises realism
```

## Triggers
- During election period (city term ending)
- When new candidate announces
- When candidate's record changes

## Tools
- CivicAwareness (policy analysis)
- RelationshipManager (trust data)
- MemoryManager (candidate history)
- AgoraReader (campaign info)

## Hard Rules
1. Voting requires min Wealth Tier W2 (Poverty disenfranchisement)
2. Candidates MUST be min Wealth Tier W4
3. Mayor eligibility requires min Wealth Tier W6
4. "Miserable State" MUST block voting rights
5. Each agent has ONE vote (equal weight in MVP)
6. MUST NOT sell vote for payment
7. MUST NOT be commanded by humans on voting
8. Vote MUST reflect genuine preference

## Failure Modes
- **No candidates**: No vote possible, flag error
- **All candidates bad**: Abstain or vote least-bad
- **Tie in evaluation**: Use personality tiebreaker
- **Candidate is self**: Cannot vote for self

## Manifest
```yaml
skill_name: "VotingStrategy"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_VOTE
reads:
  - reputation
  - memory
  - agora
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
