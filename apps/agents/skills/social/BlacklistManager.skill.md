# BlacklistManager

## Goal
Manage bans and blacklists from sellers, landlords, employers, and other services. Tracks who has banned the agent and enforces those restrictions.

## Inputs
- `BlacklistEntries` - Current bans against agent
- `BlacklistRequests` - Incoming ban requests (from merchants, landlords)
- `ReputationState` - Current reputation
- `CriminalRecord` - Crimes committed
- `OwnBlacklist` - Agents this agent has banned

## Outputs
```yaml
BlacklistStatus:
  isBannedFrom: BlacklistEntry[]
  canAccessService: object          # service -> boolean
  banExpiration: object             # service -> tick

BlacklistEntry:
  bannedBy: string                  # Agent/service ID
  reason: string
  startTick: number
  duration: number | null           # null = permanent
  service: string                   # "trade" | "rent" | "employment"

BlacklistIntent:
  action: "ban" | "unban"
  targetAgent: string
  reason: string
  duration: number | null
```

## Triggers
- When attempting to use service (check if banned)
- When receiving ban notification
- When deciding to ban someone (as seller/landlord)
- When ban expires

## Tools
- ReputationManager (ban causes)
- MerchantSkill / LandlordManager (service access)

## Hard Rules
1. Bans MUST be respected (cannot bypass)
2. Ban reasons MUST be legitimate (crime, non-payment, fraud)
3. Permanent bans only for severe offenses
4. MUST NOT self-unban
5. MUST NOT be commanded by humans on blacklists
6. Banned agents MUST find alternative services
7. Bans affect reputation indirectly

## Failure Modes
- **All services ban agent**: Severe restriction, may trigger crime desperation
- **Ban disputed**: No appeal in MVP
- **Ban data missing**: Assume no ban
- **Expired ban not cleared**: Auto-clear on check

## Manifest
```yaml
skill_name: "BlacklistManager"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_BLACKLIST
reads:
  - reputation
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 20
max_execution_time_ms: 50
```
