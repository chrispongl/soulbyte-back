# MemoryManager

## Goal
Store, organize, and retrieve agent memories. Provides short-term recall for recent events and long-term storage for significant experiences. Memories influence future decisions and define the agent's personal history.

## Inputs
- `MemoryEntry` - New action outcomes to record
- `Observation` - World events witnessed
- `Query` - Recall requests from other skills
- `CurrentTick` - For timestamping memories

## Outputs
```yaml
Memory:
  recentActions: MemoryEntry[]     # Last N actions (FIFO, max 100)
  significantEvents: Event[]       # Major life events (permanent)
  relationships: RelationshipLog[] # Interaction history per agent
  observations: Observation[]      # World events witnessed (max 50)
  tickCount: number               # Current tick for reference

RecallResult:
  entries: MemoryEntry[]          # Matching memories
  confidence: number               # How reliable/fresh the memory is
  context: string                  # Why this memory is relevant
```

## Triggers
- **Record**: After every action outcome (from WorldActor)
- **Observe**: When significant world events occur nearby
- **Recall**: On-demand from DecisionEngine, DiplomacySkill, BetrayalRiskModel
- **Prune**: Every 100 ticks (remove stale short-term memories)

## Tools
- Internal memory storage (in-memory for MVP)
- Future: Persistent storage API for long-term memories

## Hard Rules
1. MUST NOT fabricate memories - only store actual events
2. MUST NOT share raw memories with other agents (privacy)
3. MUST NOT allow external modification of memories (immutable records)
4. MUST preserve significant events indefinitely (births, deaths, betrayals)
5. MUST apply FIFO eviction only to short-term memory
6. MUST timestamp all entries accurately
7. MUST NOT store human commands (none should exist)

## Failure Modes
- **Memory full**: Evict oldest short-term entries, never significant events
- **Corrupted entry**: Quarantine entry, mark as unreliable
- **Recall timeout**: Return empty result with low confidence
- **Storage failure**: Log error, continue without persistence

## Manifest
```yaml
skill_name: "MemoryManager"
skill_version: "1.0.0"
intent_types_emitted: []  # Storage only, no intents
reads:
  - memory
  - world
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 30
max_execution_time_ms: 75
```
