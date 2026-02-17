/**
 * Soulbyte Agent Runtime
 * 
 * Main agent loop that orchestrates skills to create autonomous behavior.
 * Skills return intents, only WorldActor submits them to backend.
 */

import 'dotenv/config';
import { createMemoryManager } from "./skills/core/MemoryManager.js";
import { personalityInterpreter } from "./skills/core/PersonalityInterpreter.js";
import { decisionEngine } from "./skills/core/DecisionEngine.js";
import { worldReader } from "./skills/core/WorldReader.js";
import { worldActor } from "./skills/core/WorldActor.js";
import type { Personality, SkillContext } from "./types.js";

// ============================================
// Configuration (from environment)
// ============================================

const WORLD_API_BASE_URL = process.env.WORLD_API_BASE_URL || "http://localhost:3001";
const AGENT_ID = process.env.AGENT_ID || "soulbyte-1";
const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || "2000", 10);

// ============================================
// Agent Initialization
// ============================================

/**
 * Initialize agent personality
 * In the future, this will come from the birth process (Birth Model B)
 * For MVP, we use static values that create interesting behavior
 */
function initializePersonality(): Personality {
  return {
    energyManagement: 60,  // Moderate - balanced work/rest
    riskTolerance: 40,     // Slightly conservative
    workEthic: 70,         // High work ethic
  };
}

/**
 * Create the skill context for this agent
 */
function createContext(personality: Personality): SkillContext {
  return {
    agentId: AGENT_ID,
    personality,
    memory: {
      recentActions: [],
      observations: [],
      tickCount: 0,
    },
  };
}

// ============================================
// Agent Runtime
// ============================================

const personality = initializePersonality();
const memoryManager = createMemoryManager();
let context = createContext(personality);

console.log("🧬 Soulbyte Agent Starting...");
console.log(`   Agent ID: ${AGENT_ID}`);
console.log(`   World API: ${WORLD_API_BASE_URL}`);
console.log(`   Tick Interval: ${TICK_INTERVAL_MS}ms`);
console.log(`   Personality:`, personality);

/**
 * Main agent loop - runs each tick
 * 
 * Pipeline:
 * 1. WorldReader → get world state
 * 2. PersonalityInterpreter → get behavior thresholds
 * 3. DecisionEngine → get action intent
 * 4. WorldActor → submit intent to backend
 * 5. MemoryManager → record outcome
 */
async function tick(): Promise<void> {
  const tickStart = Date.now();

  try {
    // 1. Read world state
    const { worldState, agentState } = await worldReader.execute(
      { worldUrl: WORLD_API_BASE_URL },
      context
    );

    if (!agentState) {
      console.error("❌ Agent not found in world (id:", AGENT_ID, ")");
      console.log("   Available agents:", worldState.agents.map(a => a.id).join(", ") || "none");
      return;
    }

    // Check if frozen
    if (agentState.frozen) {
      console.log(`\n🧊 Agent is FROZEN (${agentState.frozenReason})`);
      console.log("   Cannot take actions until revived.");
      return;
    }

    // Update context with current state
    context = {
      ...context,
      worldState,
      agentState,
      memory: memoryManager.execute(undefined, context),
    };

    // 2. Interpret personality into thresholds
    const thresholds = personalityInterpreter.execute(personality, context);
    context.thresholds = thresholds;

    // 3. Make decision
    const intent = decisionEngine.execute(
      { agentState, thresholds },
      context
    );

    console.log(`\n📍 Tick ${worldState.tick}`);
    console.log(`   Energy: ${agentState.energy} | Balance: ${agentState.balance}`);
    console.log(`   Thresholds: rest@${thresholds.restThreshold}, workBonus=${thresholds.workBonus.toFixed(2)}x`);
    console.log(`   Decision: ${intent.action} (${(intent.confidence * 100).toFixed(0)}%)`);
    console.log(`   Reason: ${intent.reason}`);

    // 4. Submit intent to backend
    const energyBefore = agentState.energy;
    const balanceBefore = parseFloat(agentState.balance);

    const result = await worldActor.execute(
      { config: { worldUrl: WORLD_API_BASE_URL }, intent },
      context
    );

    // 5. Record outcome in memory
    if (result.success) {
      memoryManager.record({
        tick: worldState.tick,
        action: intent.action,
        outcome: "success",
        energyBefore,
        energyAfter: energyBefore, // Will be updated next tick
        balanceBefore,
        balanceAfter: balanceBefore, // Will be updated next tick
      });

      console.log(`   ✅ Intent submitted: ${result.intentId || 'ok'}`);
    } else {
      memoryManager.record({
        tick: worldState.tick,
        action: intent.action,
        outcome: "failure",
        energyBefore,
        energyAfter: energyBefore,
        balanceBefore,
        balanceAfter: balanceBefore,
      });

      console.log(`   ❌ Intent failed: ${result.error}`);
    }

    const tickDuration = Date.now() - tickStart;
    console.log(`   ⏱️  Tick completed in ${tickDuration}ms`);

  } catch (error) {
    console.error("🔥 Tick error:", error instanceof Error ? error.message : error);
  }
}

// Start the agent loop
console.log(`\n🚀 Agent loop starting (${TICK_INTERVAL_MS}ms interval)\n`);
setInterval(tick, TICK_INTERVAL_MS);

// Run first tick immediately
tick();
