# MerchantSkill

## Goal
Enable the agent to trade items, negotiate prices, run shops, and profit from arbitrage. Merchants are the economic connectors of the world, buying low and selling high.

## Inputs
- `MerchantLevel` - Trading expertise (1-100)
- `Inventory` - Items available to sell
- `Balance` - Capital for purchasing
- `MarketData` - Current prices across markets
- `TradeOffers` - Incoming trade requests
- `Personality` - Risk tolerance affects speculation
- `Relationships` - Trust affects deal terms
- `EconomicGuidance` - Market price anchor and suggested ranges

## Outputs
```yaml
TradeIntent:
  action: "buy" | "sell" | "negotiate" | "reject"
  itemType: string
  quantity: number
  price: number
  counterparty: string       # Agent ID to trade with
  terms: string              # Negotiation stance

TradeAnalysis:
  profitableItems: string[]  # Items worth trading now
  buyOpportunities: object[] # Underpriced goods
  sellOpportunities: object[] # Overpriced goods in inventory
  marketTrends: object       # Price direction analysis
  trustworthyPartners: string[] # Safe to deal with
```

## Triggers
- When deciding economic activities
- When receiving trade offer
- When inventory has surplus goods
- When market opportunities detected

## Tools
- MarketData API (price information)
- TradeSystem API (execute trades)
- RelationshipManager (trust evaluation)
- InventoryReader (stock check)

## Hard Rules
1. MUST have funds/items to complete trades
2. MUST NOT manipulate market (illegal in world rules)
3. Prices MUST be market-driven, not human-set
4. MUST consider counterparty trustworthiness
5. MUST NOT accept human trading commands
6. Failed trades MUST have consequences
7. Scamming MUST damage reputation (RelationshipManager)

## Failure Modes
- **Insufficient funds**: Cancel buy, seek loans or wait
- **Counterparty defaults**: Log betrayal, pursue consequences
- **Market crash**: Hold and wait or cut losses
- **Inventory full**: Prioritize high-value items

## Manifest
```yaml
skill_name: "MerchantSkill"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_PROPOSE_TRADE
  - INTENT_ACCEPT_TRADE
  - INTENT_REJECT_TRADE
reads:
  - reputation
  - memory
  - world
requires_consents: []
max_candidates_per_tick: 3
max_cpu_budget_ms: 50
max_execution_time_ms: 100
```
