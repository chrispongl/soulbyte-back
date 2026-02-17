/**
 * Agent State Types
 * Updated to match world-api response format
 */

// ============================================
// Agent State (from World API)
// ============================================

/**
 * Agent state from /api/v1/world/state
 * Matches backend world-api format
 */
export interface AgentState {
  id: string;
  name: string;
  frozen: boolean;
  frozenReason: string | null;
  cityId: string | null;
  // Flattened for easy access
  energy: number;
  balance: string;
  // Full state details
  state: {
    housingTier: string;
    wealthTier: string;
    jobType: string;
    health: number;
    energy: number;
    hunger: number;
    social: number;
    fun: number;
    purpose: number;
    reputationScore: number;
  } | null;
  wallet: {
    balanceSbyte: string;
    lockedSbyte: string;
  } | null;
}

export interface CityState {
  id: string;
  name: string;
  population: number;
  populationCap: number;
  housingCapacity: number;
  jobCapacity: number;
  securityLevel: number;
  healthServices: number;
  entertainment: number;
  transport: number;
  mayorId: string | null;
  reputationScore: number;
}

export interface WorldState {
  tick: number;
  registryVersion: string;
  agents: AgentState[];
  cities: CityState[];
}

// ============================================
// Personality System
// ============================================

export interface Personality {
  /** Energy management trait (0-100): low=lazy, high=energetic */
  energyManagement: number;
  /** Risk tolerance trait (0-100): low=conservative, high=aggressive */
  riskTolerance: number;
  /** Work ethic trait (0-100): low=leisurely, high=workaholic */
  workEthic: number;
}

export interface PersonalityThresholds {
  /** Energy level below which agent should rest (0-100) */
  restThreshold: number;
  /** Bonus multiplier for work rewards (0.0-2.0) */
  workBonus: number;
  /** Multiplier for risky action selection (0.5-1.5) */
  riskMultiplier: number;
}

// ============================================
// Memory System
// ============================================

export interface MemoryEntry {
  tick: number;
  action: string;
  outcome: "success" | "failure";
  energyBefore: number;
  energyAfter: number;
  balanceBefore: number;
  balanceAfter: number;
}

export interface Observation {
  tick: number;
  type: string;
  data: Record<string, unknown>;
}

export interface Memory {
  recentActions: MemoryEntry[];
  observations: Observation[];
  tickCount: number;
}

// ============================================
// Action Intent System
// ============================================

export type ActionType = "work" | "rest" | "idle";

export interface ActionIntent {
  action: ActionType;
  reason: string;
  confidence: number; // 0.0-1.0
  metadata?: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  intentId?: string;
  agent?: AgentState;
  error?: string;
}

// ============================================
// Intent Types (matching backend)
// ============================================

export const IntentType = {
  INTENT_IDLE: "INTENT_IDLE",
  INTENT_WORK: "INTENT_WORK",
  INTENT_REST: "INTENT_REST",
  INTENT_MOVE_CITY: "INTENT_MOVE_CITY",
} as const;

export type IntentTypeValue = (typeof IntentType)[keyof typeof IntentType];

// ============================================
// Skill Interface
// ============================================

export interface SkillContext {
  agentId: string;
  personality: Personality;
  memory: Memory;
  worldState?: WorldState;
  agentState?: AgentState;
  thresholds?: PersonalityThresholds;
}

export interface ISkill<TInput, TOutput> {
  name: string;
  version: string;
  execute(input: TInput, context: SkillContext): Promise<TOutput> | TOutput;
}
