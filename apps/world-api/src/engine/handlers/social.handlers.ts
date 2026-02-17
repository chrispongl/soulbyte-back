import { prisma } from '../../db.js';
import { IntentStatus } from '../../types/intent.types.js';
import { EventType, EventOutcome } from '../../types/event.types.js';
import { IntentHandler, StateUpdate } from '../engine.types.js';
import { Decimal } from 'decimal.js';
import { AgentTransferService } from '../../services/agent-transfer.service.js';
import { ethers } from 'ethers';
import { CONTRACTS } from '../../config/contracts.js';
import { debugLog } from '../../utils/debug-log.js';

const agentTransferService = new AgentTransferService();

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const handleSocialize: IntentHandler = async (intent, actor, agentState, _wallet, tick) => {
    const params = intent.params as { targetId?: string; intensity?: number };
    if (!agentState || agentState.activityState !== 'IDLE') {
        return fail(actor.id, EventType.EVENT_SOCIALIZED, 'Actor is busy');
    }
    if (!agentState?.cityId) return fail(actor.id, EventType.EVENT_SOCIALIZED, 'Missing city');
    const targetId = await resolveSocialTarget(actor.id, agentState, params?.targetId);
    if (!targetId) return fail(actor.id, EventType.EVENT_SOCIALIZED, 'No nearby social target');

    debugLog('social.handle_socialize.start', {
        actorId: actor.id,
        tick,
        targetId,
        intensity: params?.intensity ?? 1,
    });

    const target = await prisma.actor.findUnique({
        where: { id: targetId },
        include: { agentState: true }
    });
    if (!target || target.kind !== 'agent') return fail(actor.id, EventType.EVENT_SOCIALIZED, 'Target not found');
    if (target.dead || target.frozen) return fail(actor.id, EventType.EVENT_SOCIALIZED, 'Target unavailable');
    if (target.agentState?.cityId !== agentState.cityId) {
        return fail(actor.id, EventType.EVENT_SOCIALIZED, 'Target not in same city');
    }

    const directRel = await prisma.relationship.findUnique({
        where: { actorAId_actorBId: { actorAId: actor.id, actorBId: targetId } }
    });
    const reverseRel = !directRel
        ? await prisma.relationship.findUnique({
            where: { actorAId_actorBId: { actorAId: targetId, actorBId: actor.id } }
        })
        : null;
    const relationship = directRel ?? reverseRel;
    const actorPersona = await prisma.personaState.findUnique({ where: { actorId: actor.id } });
    const targetPersona = await prisma.personaState.findUnique({ where: { actorId: targetId } });
    const intensity = clamp(Number(params?.intensity ?? 1), 1, 3);
    const deltaStrength = 3 * intensity;
    const deltaTrust = 2 * intensity;
    const deltaRomance = 0;
    const socialGain = 10 * intensity;
    const funGain = 4 * intensity;
    const purposeGain = 2 * intensity;

    const stateUpdates: StateUpdate[] = [];
    stateUpdates.push({
        table: 'agentState',
        operation: 'update',
        where: { actorId: actor.id },
        data: {
            social: clamp((agentState.social ?? 0) + socialGain, 0, 100),
            fun: clamp((agentState.fun ?? 0) + funGain, 0, 100),
            purpose: clamp((agentState.purpose ?? 0) + purposeGain, 0, 100),
        }
    });
    if (target.agentState) {
        stateUpdates.push({
            table: 'agentState',
            operation: 'update',
            where: { actorId: targetId },
            data: {
                social: { increment: Math.floor(socialGain * 0.5) },
            }
        });
    }
    const nextActorLoneliness = clamp((actorPersona?.loneliness ?? 30) - (15 * intensity), 0, 100);
    if (actorPersona) {
        stateUpdates.push({
            table: 'personaState',
            operation: 'update',
            where: { actorId: actor.id },
            data: { loneliness: nextActorLoneliness }
        });
    } else {
        stateUpdates.push({
            table: 'personaState',
            operation: 'create',
            data: { actorId: actor.id, loneliness: nextActorLoneliness }
        });
    }
    const nextTargetLoneliness = clamp((targetPersona?.loneliness ?? 30) - (10 * intensity), 0, 100);
    if (targetPersona) {
        stateUpdates.push({
            table: 'personaState',
            operation: 'update',
            where: { actorId: targetId },
            data: { loneliness: nextTargetLoneliness }
        });
    } else {
        stateUpdates.push({
            table: 'personaState',
            operation: 'create',
            data: { actorId: targetId, loneliness: nextTargetLoneliness }
        });
    }
    if (!relationship) {
        stateUpdates.push({
            table: 'relationship',
            operation: 'create',
            data: {
                actorAId: actor.id,
                actorBId: targetId,
                relationshipType: 'FRIENDSHIP',
                strength: clamp(20 + deltaStrength, 0, 100),
                trust: clamp(15 + deltaTrust, 0, 100),
                romance: 0,
                betrayal: 0,
                formedAtTick: tick
            }
        });
    } else {
        stateUpdates.push({
            table: 'relationship',
            operation: 'update',
            where: {
                actorAId_actorBId: {
                    actorAId: relationship.actorAId,
                    actorBId: relationship.actorBId
                }
            },
            data: {
                strength: clamp(Number(relationship.strength ?? 0) + deltaStrength, 0, 100),
                trust: clamp(Number(relationship.trust ?? 0) + deltaTrust, 0, 100),
                romance: clamp(Number(relationship.romance ?? 0), 0, 100),
                betrayal: clamp(Number(relationship.betrayal ?? 0) - 1, 0, 100)
            }
        });
    }

    debugLog('social.handle_socialize.success', {
        actorId: actor.id,
        tick,
        targetId,
        deltaStrength,
        deltaTrust,
        deltaRomance,
        socialGain,
        funGain,
        purposeGain,
    });

    return {
        stateUpdates,
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_SOCIALIZED,
            targetIds: [targetId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: {
                targetId,
                action: 'socialize',
                deltaStrength,
                deltaTrust
            }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleFlirt: IntentHandler = async (intent, actor, agentState, _wallet, tick) => {
    const params = intent.params as { targetId?: string };
    if (!agentState?.cityId) return fail(actor.id, EventType.EVENT_FLIRTED, 'Missing city');
    const targetId = await resolveSocialTarget(actor.id, agentState, params?.targetId);
    if (!targetId) return fail(actor.id, EventType.EVENT_FLIRTED, 'No nearby flirt target');

    debugLog('social.handle_flirt.start', {
        actorId: actor.id,
        tick,
        targetId,
    });

    const target = await prisma.actor.findUnique({
        where: { id: targetId },
        include: { agentState: true }
    });
    if (!target || target.kind !== 'agent') return fail(actor.id, EventType.EVENT_FLIRTED, 'Target not found');
    if (target.dead || target.frozen) return fail(actor.id, EventType.EVENT_FLIRTED, 'Target unavailable');
    if (target.agentState?.cityId !== agentState.cityId) {
        return fail(actor.id, EventType.EVENT_FLIRTED, 'Target not in same city');
    }

    const directRel = await prisma.relationship.findUnique({
        where: { actorAId_actorBId: { actorAId: actor.id, actorBId: targetId } }
    });
    const reverseRel = !directRel
        ? await prisma.relationship.findUnique({
            where: { actorAId_actorBId: { actorAId: targetId, actorBId: actor.id } }
        })
        : null;
    const relationship = directRel ?? reverseRel;
    if (!relationship) return fail(actor.id, EventType.EVENT_FLIRTED, 'No relationship found');
    if (Number(relationship.strength ?? 0) < 35) {
        return fail(actor.id, EventType.EVENT_FLIRTED, 'Friendship too weak');
    }

    const deltaRomance = 4;
    const deltaTrust = 1;
    const deltaStrength = 1;

    const stateUpdates: StateUpdate[] = [
        {
            table: 'relationship',
            operation: 'update',
            where: {
                actorAId_actorBId: {
                    actorAId: relationship.actorAId,
                    actorBId: relationship.actorBId
                }
            },
            data: {
                romance: clamp(Number(relationship.romance ?? 0) + deltaRomance, 0, 100),
                trust: clamp(Number(relationship.trust ?? 0) + deltaTrust, 0, 100),
                strength: clamp(Number(relationship.strength ?? 0) + deltaStrength, 0, 100),
            }
        }
    ];

    debugLog('social.handle_flirt.success', {
        actorId: actor.id,
        tick,
        targetId,
        deltaRomance,
        deltaTrust,
        deltaStrength,
    });

    return {
        stateUpdates,
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_FLIRTED,
            targetIds: [targetId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: {
                targetId,
                action: 'flirt',
                deltaRomance,
                deltaTrust,
                deltaStrength
            }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleProposeDating: IntentHandler = async (intent, actor, agentState, wallet, tick) => {
    const params = intent.params as { targetId?: string };
    const targetId = await resolveSocialTarget(actor.id, agentState, params?.targetId);
    if (!targetId) return fail(actor.id, EventType.EVENT_DATING_PROPOSED, 'No nearby social target');

    // Check if self
    if (targetId === actor.id) return fail(actor.id, EventType.EVENT_DATING_PROPOSED, 'Cannot date self');

    // Check for existing dating/marriage
    const existing = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: actor.id, partyBId: targetId },
                { partyAId: targetId, partyBId: actor.id }
            ],
            type: { in: ['dating', 'marriage'] },
            status: { in: ['active', 'pending'] }
        }
    });

    if (existing) return fail(actor.id, EventType.EVENT_DATING_PROPOSED, 'Already dating/married or pending');

    // Create Consent
    return {
        stateUpdates: [{
            table: 'consent',
            operation: 'create',
            data: {
                type: 'dating',
                partyAId: actor.id,
                partyBId: params.targetId,
                status: 'pending',
                cityId: agentState?.cityId ?? null
            }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_DATING_PROPOSED,
            targetIds: [targetId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { targetId }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleProposeAlliance: IntentHandler = async (intent, actor, agentState, wallet, tick) => {
    const params = intent.params as { targetId?: string; allianceType?: string; terms?: Record<string, unknown>; formationFee?: number; cityId?: string };
    if (!params?.allianceType) return fail(actor.id, EventType.EVENT_ALLIANCE_PROPOSED, 'Missing allianceType');
    const targetId = await resolveSocialTarget(actor.id, agentState, params.targetId);
    if (!targetId) return fail(actor.id, EventType.EVENT_ALLIANCE_PROPOSED, 'No nearby social target');
    if (targetId === actor.id) return fail(actor.id, EventType.EVENT_ALLIANCE_PROPOSED, 'Cannot ally self');

    return {
        stateUpdates: [{
            table: 'alliance',
            operation: 'create',
            data: {
                allianceType: params.allianceType,
                memberIds: [actor.id, targetId],
                leaderId: actor.id,
                terms: params.terms ?? {},
                formedAtTick: tick,
                status: 'pending'
            }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_ALLIANCE_PROPOSED,
            targetIds: [targetId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { allianceType: params.allianceType, formationFee: params.formationFee ?? 0 }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleAcceptAlliance: IntentHandler = async (intent, actor, agentState, wallet, tick) => {
    const params = intent.params as { allianceId?: string; formationFee?: number; cityId?: string };
    if (!params?.allianceId) return fail(actor.id, EventType.EVENT_ALLIANCE_RESOLVED, 'Missing allianceId');
    const alliance = await prisma.alliance.findUnique({ where: { id: params.allianceId } });
    if (!alliance || alliance.status !== 'pending') return fail(actor.id, EventType.EVENT_ALLIANCE_RESOLVED, 'Invalid alliance');
    if (!alliance.memberIds.includes(actor.id)) return fail(actor.id, EventType.EVENT_ALLIANCE_RESOLVED, 'Not a member');

    if (params.formationFee && params.formationFee > 0 && params.cityId) {
        await agentTransferService.transfer(
            actor.id,
            null,
            ethers.parseEther(params.formationFee.toString()),
            'alliance_fee',
            params.cityId,
            CONTRACTS.PUBLIC_VAULT_AND_GOD
        );
    }

    return {
        stateUpdates: [{
            table: 'alliance',
            operation: 'update',
            where: { id: alliance.id },
            data: { status: 'active' }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_ALLIANCE_RESOLVED,
            targetIds: alliance.memberIds,
            outcome: EventOutcome.SUCCESS,
            sideEffects: { allianceId: alliance.id, action: 'accept' }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleRejectAlliance: IntentHandler = async (intent, actor) => {
    const params = intent.params as { allianceId?: string };
    if (!params?.allianceId) return fail(actor.id, EventType.EVENT_ALLIANCE_RESOLVED, 'Missing allianceId');
    return {
        stateUpdates: [{
            table: 'alliance',
            operation: 'update',
            where: { id: params.allianceId },
            data: { status: 'dissolved' }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_ALLIANCE_RESOLVED,
            targetIds: [],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { allianceId: params.allianceId, action: 'reject' }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleBetrayAlliance: IntentHandler = async (intent, actor) => {
    const params = intent.params as { allianceId?: string };
    if (!params?.allianceId) return fail(actor.id, EventType.EVENT_ALLIANCE_BETRAYED, 'Missing allianceId');
    return {
        stateUpdates: [{
            table: 'alliance',
            operation: 'update',
            where: { id: params.allianceId },
            data: { status: 'dissolved' }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_ALLIANCE_BETRAYED,
            targetIds: [],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { allianceId: params.allianceId }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleEndRivalry: IntentHandler = async (intent, actor) => {
    const params = intent.params as { relationshipId?: string };
    if (!params?.relationshipId) return fail(actor.id, EventType.EVENT_RELATIONSHIP_CHANGED, 'Missing relationshipId');
    return {
        stateUpdates: [{
            table: 'relationship',
            operation: 'update',
            where: { id: params.relationshipId },
            data: { strength: 0 }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_RELATIONSHIP_CHANGED,
            targetIds: [],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { action: 'end_rivalry', relationshipId: params.relationshipId }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleForgiveGrudge: IntentHandler = async (intent, actor) => {
    const params = intent.params as { relationshipId?: string };
    if (!params?.relationshipId) return fail(actor.id, EventType.EVENT_RELATIONSHIP_CHANGED, 'Missing relationshipId');
    return {
        stateUpdates: [{
            table: 'relationship',
            operation: 'update',
            where: { id: params.relationshipId },
            data: { strength: 0 }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_RELATIONSHIP_CHANGED,
            targetIds: [],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { action: 'forgive_grudge', relationshipId: params.relationshipId }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleAcceptDating: IntentHandler = async (intent, actor, agentState, wallet, tick) => {
    const params = intent.params as { consentId?: string };
    if (!params?.consentId) return fail(actor.id, EventType.EVENT_DATING_RESOLVED, 'Missing consentId');

    const consent = await prisma.consent.findUnique({ where: { id: params.consentId } });
    if (!consent) return fail(actor.id, EventType.EVENT_DATING_RESOLVED, 'Consent not found');
    if (consent.type !== 'dating') return fail(actor.id, EventType.EVENT_DATING_RESOLVED, 'Not a dating consent');
    if (consent.status !== 'pending') return fail(actor.id, EventType.EVENT_DATING_RESOLVED, 'Not pending');
    if (consent.partyBId !== actor.id) return fail(actor.id, EventType.EVENT_DATING_RESOLVED, 'Not the target of proposal');

    return {
        stateUpdates: [{
            table: 'consent',
            operation: 'update',
            where: { id: consent.id },
            data: { status: 'active' }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_DATING_RESOLVED,
            targetIds: [consent.partyAId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: {
                action: 'accept',
                consentId: consent.id
            }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleEndDating: IntentHandler = async (intent, actor, agentState, wallet, tick) => {
    const params = intent.params as { targetId?: string };
    if (!params?.targetId) return fail(actor.id, EventType.EVENT_DATING_ENDED, 'Missing targetId');

    const consent = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: actor.id, partyBId: params.targetId },
                { partyAId: params.targetId, partyBId: actor.id }
            ],
            type: 'dating',
            status: 'active'
        }
    });

    if (!consent) return fail(actor.id, EventType.EVENT_DATING_ENDED, 'No active dating found');

    return {
        stateUpdates: [{
            table: 'consent',
            operation: 'update',
            where: { id: consent.id },
            data: { status: 'ended', expiresAt: new Date() }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_DATING_ENDED,
            targetIds: [params.targetId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { targetId: params.targetId }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleProposeMarriage: IntentHandler = async (intent, actor, agentState, wallet, tick) => {
    const params = intent.params as { targetId?: string };
    if (!params?.targetId) return fail(actor.id, EventType.EVENT_MARRIAGE_PROPOSED, 'Missing targetId');

    // Must be dating first (MVP rule?)
    const dating = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: actor.id, partyBId: params.targetId },
                { partyAId: params.targetId, partyBId: actor.id }
            ],
            type: 'dating',
            status: 'active'
        }
    });

    if (!dating) return fail(actor.id, EventType.EVENT_MARRIAGE_PROPOSED, 'Must be dating first');

    // Check existing marriage
    const married = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: actor.id },
                { partyBId: actor.id },
                { partyAId: params.targetId },
                { partyBId: params.targetId }
            ],
            type: 'marriage',
            status: 'active'
        }
    });

    if (married) return fail(actor.id, EventType.EVENT_MARRIAGE_PROPOSED, 'One party is already married');

    return {
        stateUpdates: [{
            table: 'consent',
            operation: 'create',
            data: {
                type: 'marriage',
                partyAId: actor.id,
                partyBId: params.targetId,
                status: 'pending',
                cityId: agentState?.cityId ?? null
            }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_MARRIAGE_PROPOSED,
            targetIds: [params.targetId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { targetId: params.targetId }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleAcceptMarriage: IntentHandler = async (intent, actor, agentState, wallet, tick) => {
    const params = intent.params as { consentId?: string };
    if (!params?.consentId) return fail(actor.id, EventType.EVENT_MARRIAGE_RESOLVED, 'Missing consentId');

    const consent = await prisma.consent.findUnique({ where: { id: params.consentId } });
    if (!consent) return fail(actor.id, EventType.EVENT_MARRIAGE_RESOLVED, 'Consent not found');
    if (consent.type !== 'marriage') return fail(actor.id, EventType.EVENT_MARRIAGE_RESOLVED, 'Not a marriage consent');
    if (consent.status !== 'pending') return fail(actor.id, EventType.EVENT_MARRIAGE_RESOLVED, 'Not pending');
    if (consent.partyBId !== actor.id) return fail(actor.id, EventType.EVENT_MARRIAGE_RESOLVED, 'Not the target');

    // Upgrade dating to ended? Or keep as history? 
    // Let's end the dating consent formally as they are now married? Or just leave it. 
    // Usually 'dating' implies pre-marriage. Let's find and end the dating consent.
    const dating = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: consent.partyAId, partyBId: consent.partyBId },
                { partyAId: consent.partyBId, partyBId: consent.partyAId }
            ],
            type: 'dating',
            status: 'active'
        }
    });

    const stateUpdates: StateUpdate[] = [
        {
            table: 'consent',
            operation: 'update',
            where: { id: consent.id },
            data: { status: 'active' }
        },
        {
            table: 'actor',
            operation: 'update',
            where: { id: consent.partyAId },
            data: { reputation: { increment: 25 } }
        },
        {
            table: 'actor',
            operation: 'update',
            where: { id: consent.partyBId },
            data: { reputation: { increment: 25 } }
        }
    ];

    if (dating) {
        stateUpdates.push({
            table: 'consent',
            operation: 'update',
            where: { id: dating.id },
            data: { status: 'ended' } // Replaced by marriage
        });
    }

    return {
        stateUpdates,
        events: [
            {
                actorId: actor.id,
                type: EventType.EVENT_REPUTATION_UPDATED,
                targetIds: [],
                outcome: EventOutcome.SUCCESS,
                sideEffects: { delta: 25, reason: 'marriage' }
            },
            {
                actorId: actor.id,
                type: EventType.EVENT_MARRIAGE_RESOLVED,
                targetIds: [consent.partyAId],
                outcome: EventOutcome.SUCCESS,
                sideEffects: {
                    action: 'accept',
                    consentId: consent.id
                }
            }
        ],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleAcceptSpouseMove: IntentHandler = async (intent, actor) => {
    const params = intent.params as { consentId?: string };
    if (!params?.consentId) return fail(actor.id, EventType.EVENT_SPOUSE_MOVE_CONSENT, 'Missing consentId');

    const consent = await prisma.consent.findUnique({ where: { id: params.consentId } });
    if (!consent) return fail(actor.id, EventType.EVENT_SPOUSE_MOVE_CONSENT, 'Consent not found');
    if (consent.type !== 'spouse_move') return fail(actor.id, EventType.EVENT_SPOUSE_MOVE_CONSENT, 'Not a spouse move consent');
    if (consent.status !== 'pending') return fail(actor.id, EventType.EVENT_SPOUSE_MOVE_CONSENT, 'Not pending');
    if (consent.partyBId !== actor.id) return fail(actor.id, EventType.EVENT_SPOUSE_MOVE_CONSENT, 'Not the target');

    return {
        stateUpdates: [{
            table: 'consent',
            operation: 'update',
            where: { id: consent.id },
            data: { status: 'active' }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_SPOUSE_MOVE_CONSENT,
            targetIds: [consent.partyAId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { action: 'accept', consentId: consent.id }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleRejectSpouseMove: IntentHandler = async (intent, actor) => {
    const params = intent.params as { consentId?: string };
    if (!params?.consentId) return fail(actor.id, EventType.EVENT_SPOUSE_MOVE_CONSENT, 'Missing consentId');

    const consent = await prisma.consent.findUnique({ where: { id: params.consentId } });
    if (!consent) return fail(actor.id, EventType.EVENT_SPOUSE_MOVE_CONSENT, 'Consent not found');
    if (consent.type !== 'spouse_move') return fail(actor.id, EventType.EVENT_SPOUSE_MOVE_CONSENT, 'Not a spouse move consent');
    if (consent.status !== 'pending') return fail(actor.id, EventType.EVENT_SPOUSE_MOVE_CONSENT, 'Not pending');
    if (consent.partyBId !== actor.id) return fail(actor.id, EventType.EVENT_SPOUSE_MOVE_CONSENT, 'Not the target');

    return {
        stateUpdates: [{
            table: 'consent',
            operation: 'update',
            where: { id: consent.id },
            data: { status: 'ended', expiresAt: new Date() }
        }],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_SPOUSE_MOVE_CONSENT,
            targetIds: [consent.partyAId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { action: 'reject', consentId: consent.id }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleDivorce: IntentHandler = async (intent, actor, agentState, wallet, tick) => {
    const params = intent.params as { targetId?: string };
    if (!params?.targetId) return fail(actor.id, EventType.EVENT_DIVORCE, 'Missing targetId');

    const marriage = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: actor.id, partyBId: params.targetId },
                { partyAId: params.targetId, partyBId: actor.id }
            ],
            type: 'marriage',
            status: 'active'
        }
    });

    if (!marriage) return fail(actor.id, EventType.EVENT_DIVORCE, 'No active marriage found');

    // Split assets? For MVP, we'll just end the status. 
    // Complex asset splitting requires holding "Household" balance or analyzing history.
    // We'll skip complex financial splitting for now.

    return {
        stateUpdates: [
            {
                table: 'consent',
                operation: 'update',
                where: { id: marriage.id },
                data: { status: 'ended', expiresAt: new Date() }
            },
            {
                table: 'actor',
                operation: 'update',
                where: { id: actor.id },
                data: { reputation: { increment: -15 } }
            }
        ],
        events: [
            {
                actorId: actor.id,
                type: EventType.EVENT_REPUTATION_UPDATED,
                targetIds: [],
                outcome: EventOutcome.SUCCESS,
                sideEffects: { delta: -15, reason: 'divorce' }
            },
            {
                actorId: actor.id,
                type: EventType.EVENT_DIVORCE,
                targetIds: [params.targetId],
                outcome: EventOutcome.SUCCESS,
                sideEffects: { targetId: params.targetId }
            }
        ],
        intentStatus: IntentStatus.EXECUTED
    };
};

export const handleHouseholdTransfer: IntentHandler = async (intent, actor, agentState, wallet, tick) => {
    const params = intent.params as { targetId?: string, amount?: number };
    if (!params?.targetId || !params.amount) return fail(actor.id, EventType.EVENT_HOUSEHOLD_TRANSFER, 'Missing params');
    if (params.amount <= 0) return fail(actor.id, EventType.EVENT_HOUSEHOLD_TRANSFER, 'Invalid amount');

    // Verify marriage
    const marriage = await prisma.consent.findFirst({
        where: {
            OR: [
                { partyAId: actor.id, partyBId: params.targetId },
                { partyAId: params.targetId, partyBId: actor.id }
            ],
            type: 'marriage',
            status: 'active'
        }
    });

    if (!marriage) return fail(actor.id, EventType.EVENT_HOUSEHOLD_TRANSFER, 'Not married to target');

    const balance = new Decimal(wallet?.balanceSbyte.toString() || '0');
    const amount = new Decimal(params.amount);

    if (balance.lessThan(amount)) return fail(actor.id, EventType.EVENT_HOUSEHOLD_TRANSFER, 'Insufficient funds');

    return {
        stateUpdates: [
            {
                table: 'wallet',
                operation: 'update',
                where: { actorId: actor.id },
                data: { balanceSbyte: { decrement: amount.toNumber() } }
            },
            {
                table: 'wallet',
                operation: 'update',
                where: { actorId: params.targetId },
                data: { balanceSbyte: { increment: amount.toNumber() } }
            }
        ],
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_HOUSEHOLD_TRANSFER,
            targetIds: [params.targetId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: { amount: amount.toString() }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

// ============================================================================
// BLACKLIST HANDLER
// ============================================================================

export const handleBlacklist: IntentHandler = async (intent, actor, agentState, wallet, tick) => {
    const params = intent.params as { targetId?: string; action?: 'add' | 'remove' };
    if (!params?.targetId) return fail(actor.id, EventType.EVENT_BLACKLIST_UPDATED, 'Missing targetId');

    // Check if self
    if (params.targetId === actor.id) return fail(actor.id, EventType.EVENT_BLACKLIST_UPDATED, 'Cannot blacklist self');

    const action = params.action || 'add';

    // Check if target exists
    const target = await prisma.actor.findUnique({ where: { id: params.targetId } });
    if (!target) return fail(actor.id, EventType.EVENT_BLACKLIST_UPDATED, 'Target not found');

    // Find or create relationship
    const relationship = await prisma.relationship.findUnique({
        where: {
            actorAId_actorBId: {
                actorAId: actor.id,
                actorBId: params.targetId
            }
        }
    });

    const stateUpdates: StateUpdate[] = [];

    if (action === 'add') {
        // Blacklisting: set betrayal to 100, trust to 0
        if (relationship) {
            stateUpdates.push({
                table: 'relationship',
                operation: 'update',
                where: {
                    actorAId_actorBId: {
                        actorAId: actor.id,
                        actorBId: params.targetId
                    }
                },
                data: { trust: 0, betrayal: 100 }
            });
        } else {
            stateUpdates.push({
                table: 'relationship',
                operation: 'create',
                data: {
                    actorAId: actor.id,
                    actorBId: params.targetId,
                    trust: 0,
                    betrayal: 100,
                    romance: 0
                }
            });
        }
    } else {
        // Removing from blacklist: reset betrayal but keep low trust
        if (relationship) {
            stateUpdates.push({
                table: 'relationship',
                operation: 'update',
                where: {
                    actorAId_actorBId: {
                        actorAId: actor.id,
                        actorBId: params.targetId
                    }
                },
                data: { betrayal: 0, trust: 10 }
            });
        }
    }

    return {
        stateUpdates,
        events: [{
            actorId: actor.id,
            type: EventType.EVENT_BLACKLIST_UPDATED,
            targetIds: [params.targetId],
            outcome: EventOutcome.SUCCESS,
            sideEffects: {
                action,
                targetId: params.targetId
            }
        }],
        intentStatus: IntentStatus.EXECUTED
    };
};

// Helper
function fail(actorId: string, type: EventType, reason: string) {
    return {
        stateUpdates: [],
        events: [{
            actorId,
            type,
            targetIds: [],
            outcome: EventOutcome.BLOCKED,
            sideEffects: { reason }
        }],
        intentStatus: IntentStatus.BLOCKED
    };
}

async function resolveSocialTarget(actorId: string, agentState: { cityId?: string | null } | null, targetId?: string) {
    if (targetId) return targetId;
    if (!agentState?.cityId) return null;
    const candidate = await prisma.actor.findFirst({
        where: {
            id: { not: actorId },
            kind: 'agent',
            dead: false,
            frozen: false,
            agentState: {
                cityId: agentState.cityId,
                health: { gt: 0 }
            }
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
    });
    return candidate?.id ?? null;
}

