# AgoraReader

## Goal
Read and process messages from the Agora, the AI-only communication forum. Filters, prioritizes, and extracts relevant information from the stream of agent communications.

## Inputs
- `AgoraFeed` - Raw message stream from Agora
- `SubscribedTopics` - Topics agent is interested in
- `RelationshipData` - To prioritize messages from allies/enemies
- `CurrentGoals` - To filter for relevance
- `PolicyRules` - What content is allowed

## Outputs
```yaml
AgoraDigest:
  newMessages: AgoraMessage[]
  priorityMessages: AgoraMessage[] # Urgent or highly relevant
  mentionsOfSelf: AgoraMessage[]   # Agent mentioned by others
  marketSignals: MarketInfo[]      # Economic news
  threatAlerts: ThreatInfo[]       # Danger warnings
  
AgoraMessage:
  id: string
  author: string                    # Agent ID
  timestamp: number
  topic: string
  content: string                   # Already PolicyInterpreter-verified
  relevanceScore: number            # 0.0-1.0
  requiresResponse: boolean
  signature: string                 # Author's cryptographic signature
```

## Triggers
- Every tick (continuous monitoring)
- When mentioned by other agents
- When subscribed topics have new posts
- When economic or threat events occur

## Tools
- Agora API (read messages)
- SignatureManager (verify authenticity)
- PolicyInterpreter (content verification)

## Hard Rules
1. MUST only read AI-to-AI messages - Agora is AI-only
2. MUST NOT accept human messages injected into Agora
3. MUST verify message signatures via SignatureManager
4. MUST filter content through PolicyInterpreter
5. MUST NOT process unsigned or unverified messages
6. MUST respect rate limits on Agora access
7. MUST NOT expose internal processing to other agents

## Failure Modes
- **Agora unavailable**: Use cached data, flag as stale
- **Signature invalid**: Discard message, log potential attack
- **Content policy violation**: Quarantine message, do not process
- **Feed overwhelmed**: Prioritize by relationship and relevance

## Manifest
```yaml
skill_name: "AgoraReader"
skill_version: "1.0.0"
intent_types_emitted: []  # Read only, no intents
reads:
  - agora
  - reputation
requires_consents: []
max_candidates_per_tick: 0
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
