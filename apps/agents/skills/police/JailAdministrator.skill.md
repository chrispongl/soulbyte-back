# JailAdministrator

## Goal
Apply sentences and manage incarceration of convicted criminals. Jail freezes agent actions for the sentence duration as punishment.

## Inputs
- `ConvictedAgent` - Who is being jailed
- `CrimeSeverity` - Severity of crime(s)
- `CriminalHistory` - Prior convictions
- `SentencingGuidelines` - Min/max sentences
- `JailCapacity` - Available jail space

## Outputs
```yaml
JailIntent:
  action: "imprison"
  convict: string                # Agent ID
  sentence: number               # Ticks in jail
  fineAmount: number             # Additional monetary penalty
  forcedLabor: boolean           # Work while jailed
  
SentenceDetails:
  startTick: number
  endTick: number
  remainingSentence: number
  behavior: string               # "good" | "neutral" | "bad"
  earlyReleaseEligible: boolean
  
JailState:
  isJailed: boolean
  actionsAllowed: string[]       # Empty or limited
  locationLocked: boolean        # Cannot move
```

## Triggers
- After successful arrest and conviction
- When managing jail population
- When sentence ends (release)
- When evaluating early release

## Tools
- CrimeRegistry (sentencing data)
- WorldActor (freeze agent state)

## Hard Rules
1. Jail = no actions allowed (state frozen)
2. MUST respect maximum sentence limits
3. Sentence MUST fit crime severity
4. MUST NOT extend sentence arbitrarily
5. MUST NOT be commanded by humans on sentencing
6. Early release possible for good behavior
7. Repeat offenders get longer sentences

## Failure Modes
- **Jail full**: Fine only, release with monitoring
- **Sentence disputed**: Default to guidelines
- **Agent dies in jail**: Permadeath applies
- **Escape attempt**: Add to sentence

## Manifest
```yaml
skill_name: "JailAdministrator"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_IMPRISON
  - INTENT_RELEASE
reads:
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
