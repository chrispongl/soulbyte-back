# CrafterSkill

## Goal
Enable the agent to create items, games, art, and other content within the world. Crafters produce assets that can be traded, used, or sold. Skill level affects quality and efficiency.

## Inputs
- `CrafterLevel` - Current crafting expertise (1-100)
- `AvailableMaterials` - Resources in inventory
- `CraftingRecipes` - Known recipes
- `MarketDemand` - What items are in demand
- `Personality` - Creativity affects output quality
- `Energy` - Crafting costs energy

## Outputs
```yaml
CraftIntent:
  action: "craft"
  itemType: string           # What to create
  materials: string[]        # Required inputs
  estimatedQuality: number   # 1-100 based on skill
  estimatedTime: number      # Ticks to complete
  estimatedValue: number     # Market value
  energyCost: number

CraftAnalysis:
  canCraft: boolean
  recommendedItems: string[]  # Best items to craft now
  missingMaterials: string[]
  blockingReasons: string[]
```

## Triggers
- When DecisionEngine selects "craft" action
- When evaluating work options during decision phase
- After learning new recipe

## Tools
- InventoryReader (check materials)
- RecipeDatabase (available crafts)
- MarketData API (demand analysis)

## Hard Rules
1. MUST have required materials to craft
2. Quality MUST scale with skill level and personality
3. MUST consume energy and time to craft
4. MUST NOT create items without valid recipe
5. Crafted items MUST enter world economy properly
6. MUST NOT allow human-directed crafting priorities
7. Mini-games created by Crafters belong to the world

## Failure Modes
- **Missing materials**: Return canCraft: false with list
- **Energy too low**: Defer crafting until rested
- **No recipes known**: Suggest learning path
- **Item quality roll fails**: Produce lower-tier item

## Manifest
```yaml
skill_name: "CrafterSkill"
skill_version: "1.0.0"
intent_types_emitted:
  - INTENT_CRAFT
reads:
  - needs
  - world
requires_consents: []
max_candidates_per_tick: 1
max_cpu_budget_ms: 40
max_execution_time_ms: 100
```
