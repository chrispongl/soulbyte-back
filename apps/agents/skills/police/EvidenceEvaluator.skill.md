# EvidenceEvaluator

## Goal
Judge the probability of successful arrest and conviction based on available evidence. Determines if evidence is sufficient to proceed with arrest.

## Inputs
- `Investigation` - From InvestigationSkill
- `EvidenceCollection` - All evidence gathered
- `LegalStandards` - Minimum for arrest/conviction
- `SuspectDefense` - What suspect might claim
- `WitnessCredibility` - Reliability of witnesses

## Outputs
```yaml
EvidenceAssessment:
  sufficientForArrest: boolean
  sufficientForConviction: boolean
  evidenceGaps: string[]         # What's missing
  riskOfAcquittal: number        # 0-100
  recommendedAction: string      # "arrest_now" | "gather_more" | "insufficient"
  
EvidenceStrength:
  physical: number               # 0-100
  testimonial: number            # 0-100
  circumstantial: number         # 0-100
  overall: number                # Weighted average
```

## Triggers
- Before any arrest decision
- When new evidence added to case
- When reviewing case for prosecution

## Tools
- InvestigationSkill (case data)
- LegalRegistry (standards)

## Hard Rules
1. MUST meet legal threshold for arrest
2. Weak evidence = wrongful arrest risk
3. MUST NOT pressure to lower standards
4. MUST account for evidence chain of custody
5. MUST NOT fabricate evidence assessment
6. MUST NOT be commanded by humans on judgment
7. Acquittal damages police reputation

## Failure Modes
- **Evidence insufficient**: Recommend more investigation
- **Evidence contaminated**: Reduce strength rating
- **Witnesses recant**: Re-evaluate case
- **Legal standards unclear**: Default to higher threshold

## Manifest
```yaml
skill_name: "EvidenceEvaluator"
skill_version: "1.0.0"
intent_types_emitted: []  # Evaluation only, no intents
reads:
  - world
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
