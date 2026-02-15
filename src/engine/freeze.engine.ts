/**
 * Freeze Engine - Handles economic and health freeze states
 * MVP: All terminal states result in freeze, not death
 * 
 * Freeze conditions (per STATUS_AND_WEALTH_SPEC):
 * - balance_sbyte == 0
 * - housing_tier == 'street' (homeless)
 * - all statuses ≤ 5
 */
import { prisma } from '../db.js';
import { EventType, EventOutcome } from '../types/event.types.js';
import type { Prisma } from '../../../../generated/prisma/index.js';

type TransactionClient = Prisma.TransactionClient;

/**
 * Check all agents for freeze conditions
 * Returns count of newly frozen agents
 */
export async function checkFreeze(currentTick: number): Promise<number> {
    let freezeCount = 0;

    // Get all non-frozen agents with their state
    const agents = await prisma.actor.findMany({
        where: {
            kind: 'agent',
            frozen: false,
        },
        include: {
            agentState: true,
            wallet: true,
        },
    });

    for (const agent of agents) {
        const state = agent.agentState;
        const wallet = agent.wallet;

        if (!state || !wallet) continue;

        // Check economic freeze conditions
        const economicFreezeCondition = checkEconomicFreeze(state, wallet);
        const healthFreezeCondition = checkHealthFreeze(state);

        if (economicFreezeCondition || healthFreezeCondition) {
            const reason = economicFreezeCondition ? 'economic_freeze' : 'health_collapse';

            await prisma.$transaction(async (tx: TransactionClient) => {
                // Set frozen flag
                await tx.actor.update({
                    where: { id: agent.id },
                    data: {
                        frozen: true,
                        frozenReason: reason,
                    },
                });

                // Create freeze event
                await tx.event.create({
                    data: {
                        actorId: agent.id,
                        type: EventType.EVENT_FROZEN,
                        targetIds: [],
                        tick: currentTick,
                        outcome: EventOutcome.SUCCESS,
                        sideEffects: {
                            reason,
                            balance: wallet.balanceSbyte.toString(),
                            housingTier: state.housingTier,
                            health: state.health,
                            energy: state.energy,
                            hunger: state.hunger,
                            social: state.social,
                            fun: state.fun,
                            purpose: state.purpose,
                        },
                    },
                });
            });

            freezeCount++;
            console.log(`  Agent ${agent.name} (${agent.id}) frozen: ${reason}`);
        }
    }

    return freezeCount;
}

/**
 * Check economic freeze conditions
 * Per STATUS_AND_WEALTH_SPEC Section 11:
 * - balance_sbyte == 0
 * - no housing (street)
 * - all statuses ≤ 5
 */
function checkEconomicFreeze(
    state: {
        housingTier: string;
        health: number;
        energy: number;
        hunger: number;
        social: number;
        fun: number;
        purpose: number;
    },
    wallet: { balanceSbyte: unknown }
): boolean {
    const balance = parseFloat(String(wallet.balanceSbyte));

    // Must be bankrupt
    if (balance > 0) return false;

    // Must be homeless
    if (state.housingTier !== 'street') return false;

    // All statuses must be ≤ 5
    const allStatusesCollapsed = (
        state.health <= 5 &&
        state.energy <= 5 &&
        state.hunger <= 5 &&
        state.social <= 5 &&
        state.fun <= 5 &&
        state.purpose <= 5
    );

    return allStatusesCollapsed;
}

/**
 * Check health freeze condition
 * Per HealthEvaluator v2.0.0: health=0 triggers freeze
 */
function checkHealthFreeze(
    state: { health: number }
): boolean {
    return state.health <= 0;
}

/**
 * Revival handler - called when human deposits SBYTE
 * Clears frozen flag and sets baseline stats
 */
export async function reviveAgent(
    actorId: string,
    depositAmount: number,
    depositorInfo: string,
    currentTick: number,
    applyDeposit: boolean = true
): Promise<boolean> {
    const actor = await prisma.actor.findUnique({
        where: { id: actorId },
        include: { agentState: true },
    });

    if (!actor || !actor.frozen) {
        return false;
    }

    await prisma.$transaction(async (tx: TransactionClient) => {
        if (applyDeposit && depositAmount > 0) {
            // Add deposited SBYTE
            await tx.wallet.update({
                where: { actorId },
                data: {
                    balanceSbyte: { increment: depositAmount },
                },
            });
        }

        // Reset to baseline stats
        await tx.agentState.update({
            where: { actorId },
            data: {
                health: 30,
                energy: 30,
                hunger: 30,
                social: 20,
                fun: 20,
                purpose: 20,
                // Housing remains street, must find housing
            },
        });

        // Clear frozen flag
        await tx.actor.update({
            where: { id: actorId },
            data: {
                frozen: false,
                frozenReason: null,
            },
        });

        // Create revival event
        await tx.event.create({
            data: {
                actorId,
                type: EventType.EVENT_UNFROZEN,
                targetIds: [],
                tick: currentTick,
                outcome: EventOutcome.SUCCESS,
                sideEffects: {
                    reason: 'human_deposit',
                    depositAmount,
                    depositorInfo,
                },
            },
        });
    });

    console.log(`Agent ${actorId} revived via deposit of ${depositAmount} SBYTE`);
    return true;
}

/**
 * Auto-revive frozen agents when balance is positive.
 * This is a safety net for manual deposits that bypass explicit revive calls.
 */
export async function reviveFrozenAgents(currentTick: number): Promise<number> {
    const frozenAgents = await prisma.actor.findMany({
        where: {
            kind: 'agent',
            frozen: true,
            wallet: { balanceSbyte: { gt: 0 } },
        },
        include: { agentState: true, wallet: true },
    });

    let revived = 0;
    for (const agent of frozenAgents) {
        if (!agent.agentState || !agent.wallet) continue;
        await reviveAgent(
            agent.id,
            0,
            'balance_positive',
            currentTick,
            false
        );
        revived += 1;
    }

    return revived;
}
