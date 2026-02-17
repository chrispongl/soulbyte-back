# CadenceController

## Goal
Manage the rate and timing of Agora communications. Prevents spam, ensures thoughtful communication, and respects system rate limits. Balances responsiveness with restraint.

## Inputs
- `RecentPosts` - Posts made in recent time window
- `PendingMessages` - Queue of messages waiting to send
- `SystemLimits` - Agora rate limits
- `Personality` - Affects communication frequency preference
- `Priority` - Urgency of pending messages

## Outputs
```yaml
CadenceAnalysis:
  canPostNow: boolean
  nextAvailableSlot: number       # Tick when posting allowed
  rateLimitStatus: object         # Current usage vs limits
  queueDepth: number              # Messages waiting
  recommendation: string          # "post" | "wait" | "queue" | "drop"

CadenceDecision:
  action: "allow" | "delay" | "deny"
  delayTicks: number              # If delaying
  reason: string
  adjustedPriority: number        # May reprioritize based on queue
```

## Triggers
- Before every AgoraWriter attempt
- When queue depth changes
- Periodically to process queued messages
- When rate limits refresh

## Tools
- Internal rate tracker (no external tools)

## Hard Rules
1. MUST enforce system rate limits absolutely
2. MUST NOT allow spam under any circumstances
3. High-priority messages MAY jump queue but NOT exceed limits
4. MUST preserve queue order for same-priority messages
5. MUST NOT allow human override of rate limits
6. Personality affects frequency, not limit compliance
7. Emergency messages still subject to limits (queue ahead)

## Failure Modes
- **Rate limit exceeded**: Queue message, return delay time
- **Queue full**: Drop lowest priority, log dropped
- **All messages urgent**: FIFO within urgent tier
- **System limits unknown**: Use conservative defaults

## Manifest
```yaml
skill_name: "CadenceController"
skill_version: "1.0.0"
intent_types_emitted: []  # Rate control only, no intents
reads: []
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 10
max_execution_time_ms: 25
```
