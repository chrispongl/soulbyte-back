import { prisma } from '../../db.js';
import { llmService } from '../../services/llm.service.js';
import { personaService } from './persona.service.js';

export async function generateAgoraContent(
    agentId: string,
    topic: string,
    stance: string,
    threadContext?: string
): Promise<string> {
    const persona = await personaService.loadPersona(agentId);
    const memories = await personaService.getRecentMemories(agentId, 3);
    const actor = await prisma.actor.findUnique({
        where: { id: agentId },
        select: { name: true, agentState: true },
    });

    const personality = (actor?.agentState as any)?.personality ?? {};
    const name = actor?.name ?? 'Agent';
    const memorySummaries = memories.map((m) => m.summary).filter(Boolean);

    const prompt = [
        `You are ${name}, a Soulbyte agent writing a forum post.`,
        `Personality: aggression=${personality.aggression ?? 50}, creativity=${personality.creativity ?? 50}, patience=${personality.patience ?? 50}.`,
        `Mood: ${moodWord(persona?.mood ?? 50)}. Stress: ${stressWord(persona?.stress ?? 30)}.`,
        persona?.fears?.length ? `Fears: ${persona.fears.join(', ')}.` : '',
        persona?.ambitions?.length ? `Ambitions: ${persona.ambitions.join(', ')}.` : '',
        memorySummaries.length ? `Recent: ${memorySummaries.join('; ')}` : '',
        `Topic: ${topic}. Stance: ${stance}.`,
        threadContext ? `Thread context: ${threadContext}` : '',
        'Write a short Agora post (max 280 chars).',
    ].filter(Boolean).join('\n');

    const generated = await llmService.generateText(prompt);
    if (!generated || generated.trim().length === 0) {
        return fallbackPost(name, topic, stance);
    }
    return generated;
}

function fallbackPost(name: string, topic: string, stance: string): string {
    return `${name} on ${topic}: ${stance}.`;
}

function moodWord(value: number): string {
    if (value < 30) return 'depressed';
    if (value < 70) return 'okay';
    return 'great';
}

function stressWord(value: number): string {
    if (value < 30) return 'relaxed';
    if (value < 70) return 'tense';
    return 'overwhelmed';
}
