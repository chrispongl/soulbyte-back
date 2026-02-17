# EscapePlanner

## Goal
Plan and execute escape after criminal activity. Reduces detection chance and evades police pursuit. Cannot erase crimes but can reduce immediate capture risk.

## Inputs
- `CrimeJustCommitted` - What was done
- `DetectionStatus` - Was crime witnessed
- `PoliceProximity` - Nearby law enforcement
- `CityLayout` - Escape routes available
- `Notoriety` - Current heat level
- `HideoutLocations` - Safe places to flee to

## Outputs
```yaml
EscapeStrategy:
  action: "flee" | "hide" | "blend" | "distract"
  destination: string            # Where to go
  route: string[]                # Path to take
  disguise: boolean              # Attempt to change appearance
  layLowDuration: number         # Ticks to stay hidden

EscapeOutcome:
  escaped: boolean
  pursuedBy: string[]            # Police/victims following
  newNotoriety: number           # After escape attempt
  safeLocation: string | null
```

## Triggers
- Immediately after any crime
- When police approach
- When witnesses alert authorities
- When notoriety becomes high

## Tools
- WorldReader (environment awareness)
- CitySelector (hideout options)

## Hard Rules
1. MUST NOT erase crimes from record
2. Only reduces immediate capture, not long-term consequences
3. Failed escape leads to arrest
4. MUST NOT teleport or cheat physics
5. MUST NOT be commanded by humans on escape route
6. High notoriety makes escape harder
7. Laying low reduces notoriety slowly over time

## Failure Modes
- **Cornered**: Surrender or fight (desperation)
- **No escape route**: Capture likely
- **Pursuit faster**: Get caught
- **Hideout compromised**: Find new location

## Manifest
```yaml
skill_name: "EscapePlanner"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_FLEE
  - INTENT_HIDE
reads:
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
