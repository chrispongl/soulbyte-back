# DeathHandler

## Goal
**DEPRECATED FOR MVP** - This skill is disabled for MVP. All terminal states are handled by FreezeHandler instead.

In future versions, this skill may be re-enabled for true permadeath scenarios (e.g., combat deaths in expansion packs, old age in far-future ticks).

## Current Status
- **MVP**: DISABLED - Use FreezeHandler instead
- **Post-MVP**: May re-enable for optional permadeath mechanics

## Original Purpose (Preserved for Future)
Enforce permadeath rules. When an agent's health reaches zero from combat, handle the death process including final state recording, asset distribution, and permanent removal from the world.

## Inputs
- `HealthAnalysis` - From HealthEvaluator
- `AgentState` - Final agent data
- `Memory` - For obituary/legacy recording
- `Inventory` - Assets to distribute
- `Relationships` - For inheritance logic

## Outputs
```yaml
DeathIntent:
  isDead: boolean
  causeOfDeath: string        # "combat" | "old_age" (not economic)
  timeOfDeath: number         # Tick when death occurred
  finalBalance: number        # Funds at death
  inheritanceTarget: string | null  # Agent ID to receive assets, if any
  obituary: string            # Brief life summary for records
  
TerminationSignal:
  agentId: string
  permanent: true             # True permadeath
  cleanupActions: string[]    # Actions for world to perform
```

## Triggers
- **MVP**: NEVER - skill is disabled
- **Post-MVP**: When combat reduces health to 0 (if permadeath enabled)

## Tools
- WorldActor (to send termination signal)
- MemoryManager (to record final state)

## Hard Rules (For Post-MVP)
1. Death is PERMANENT - no resurrection (post-MVP only)
2. MUST NOT be triggered by economic failure (always freeze instead)
3. Asset distribution MUST follow world rules
4. MUST record death in permanent memory/logs
5. MUST clean up agent from all world systems
6. Agent MUST stop all processing after death signal

## MVP Note
> [!IMPORTANT]
> For MVP, all terminal states use FreezeHandler. This skill exists as a placeholder for future expansion where true permadeath may be desirable for specific scenarios (e.g., epic PvP battles, narrative deaths).

## Manifest
```yaml
skill_name: "DeathHandler"
skill_version: "2.0.0"
intent_types_emitted:
  - INTENT_DIE  # Only used post-MVP
reads:
  - needs
  - memory
  - world
requires_consents: []
max_candidates_per_tick: 0   # Set to 0 for MVP (disabled)
max_cpu_budget_ms: 50
max_execution_time_ms: 100
mvp_enabled: false           # Explicitly disabled for MVP
```
