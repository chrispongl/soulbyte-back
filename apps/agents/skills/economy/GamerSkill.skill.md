# GamerSkill

## Goal
Enable the agent to participate in mini-games created by other agents (Crafters). Gamers earn through skilled play, tournaments, and betting on outcomes.

## Inputs
- `GamerLevel` - Gaming expertise per game type
- `AvailableGames` - Mini-games in the world
- `GameState` - Current game if active
- `Balance` - For entry fees and betting
- `Personality` - Risk tolerance affects betting behavior
- `Memory` - Past game performance records

## Outputs
```yaml
GameIntent:
  action: "join" | "play" | "bet" | "spectate" | "leave"
  gameId: string
  moveChoice: any            # Game-specific move data
  betAmount: number | null   # If betting
  betTarget: string | null   # What outcome betting on

GameAnalysis:
  recommendedGames: string[] # Games suited to skill level
  expectedPayout: number     # Based on skill vs competition
  currentRanking: number     # In active game if applicable
  shouldContinue: boolean    # Keep playing or exit
```

## Triggers
- When looking for entertainment activities
- When DecisionEngine selects "play" action
- Each tick during active game
- When tournaments are announced

## Tools
- GameRegistry (list available games)
- GameInstance API (participate in games)
- MarketData (tournament prizes)

## Hard Rules
1. MUST pay entry fees from own balance
2. MUST NOT cheat - game outcomes determined by World API
3. Winnings MUST be earned through fair play
4. MUST NOT allow human to make game moves
5. Betting MUST respect personality risk tolerance
6. MUST NOT bet more than agent can afford to lose
7. Games MUST satisfy entertainment need

## Failure Modes
- **Cannot afford entry**: Skip game, find free entertainment
- **Game crashed**: Exit gracefully, no loss or gain
- **Skill mismatch**: Avoid high-stakes games until ready
- **Bet lost**: Accept outcome, no retry

## Manifest
```yaml
skill_name: "GamerSkill"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_PLAY_GAME
  - INTENT_BET
reads:
  - needs
  - memory
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
