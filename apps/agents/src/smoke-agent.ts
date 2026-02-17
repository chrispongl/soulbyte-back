/**
 * Smoke Agent
 * Minimal agent that submits INTENT_WORK every tick to verify backend integration.
 */

import 'dotenv/config';
import axios from 'axios';

const WORLD_API_BASE_URL = process.env.WORLD_API_BASE_URL || "http://localhost:3001";
const AGENT_ID = process.env.AGENT_ID || "455f1ef4-fa59-4b90-9d81-64df40af27a4"; // Ensure this matches genesis.ts or created agent
const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || "2000", 10);

interface WorldState {
    tick: number;
    agents: Array<{
        id: string;
        balance: string;
        energy: number;
        frozen: boolean;
    }>;
}

async function runTick() {
    try {
        // 1. Get World State
        const stateRes = await axios.get<WorldState>(`${WORLD_API_BASE_URL}/api/v1/world/state`);
        const worldState = stateRes.data;
        const agent = worldState.agents.find((a) => a.id === AGENT_ID);

        if (!agent) {
            console.error(`❌ Agent ${AGENT_ID} not found in world! Available: ${worldState.agents.map((a) => a.id).join(', ')}`);
            return;
        }

        console.log(`\n📍 Tick ${worldState.tick} | Agent ${AGENT_ID}`);
        // @ts-expect-error - axios response type
        console.log(`   Balance: ${agent.balance} | Energy: ${agent.energy} | Frozen: ${agent.frozen}`);

        // @ts-expect-error - axios response type
        if (agent.frozen) {
            console.warn("   🧊 Agent is frozen. Skipping action.");
            return;
        }

        // 2. Submit Work Intent
        console.log("   ➡️ Submitting INTENT_WORK...");
        const intentRes = await axios.post(`${WORLD_API_BASE_URL}/api/v1/intents`, {
            actorId: AGENT_ID,
            type: "INTENT_WORK",
            params: { effort: "normal" }
        });

        if (intentRes.status === 201) {
            // @ts-expect-error - axios response type
            console.log(`   ✅ Intent accepted: ${intentRes.data.intent.id} (${intentRes.data.intent.status})`);
        } else {
            console.error(`   ❌ Intent rejected: ${intentRes.status}`);
        }

    } catch (error: any) {
        if (error.response) {
            console.error(`🔥 API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`🔥 Network Error: ${error.message}`);
        }
    }
}

console.log(`💨 Smoke Agent Starting... Target: ${WORLD_API_BASE_URL}, Agent: ${AGENT_ID}`);
// @ts-expect-error - setInterval type
setInterval(runTick, TICK_INTERVAL_MS);
runTick();
