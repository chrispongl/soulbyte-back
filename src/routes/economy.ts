/**
 * Economy Routes
 */
import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { computeEconomicSnapshots, computeGodEconomicReport, getGlobalReport } from '../services/economy-snapshot.service.js';

export async function economyRoutes(app: FastifyInstance) {
    /**
     * GET /api/v1/economy/global
     * Returns latest GodEconomicReport (admin use)
     */
    app.get('/api/v1/economy/global', async (_request, reply) => {
        let report = getGlobalReport();
        if (!report) {
            const worldState = await prisma.worldState.findFirst({ where: { id: 1 } });
            const currentTick = worldState?.tick ?? 0;
            await computeEconomicSnapshots(currentTick);
            report = await computeGodEconomicReport(currentTick);
        }
        return reply.send({ report });
    });

    /**
     * GET /api/v1/economy/transactions/count
     * Query params: start_date, end_date, city_id
     */
    app.get('/api/v1/economy/transactions/count', async (request, reply) => {
        const { start_date, end_date, city_id } = request.query as {
            start_date?: string;
            end_date?: string;
            city_id?: string;
        };

        const parseDate = (value?: string) => {
            if (!value) return null;
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? null : date;
        };

        const start = parseDate(start_date);
        const end = parseDate(end_date);

        if (start_date && !start) {
            return reply.code(400).send({ error: 'Invalid start_date' });
        }
        if (end_date && !end) {
            return reply.code(400).send({ error: 'Invalid end_date' });
        }

        const where: Record<string, unknown> = {
            ...(city_id ? { cityId: city_id } : {})
        };

        if (start || end) {
            where.createdAt = {};
            if (start) (where.createdAt as Record<string, Date>).gte = start;
            if (end) (where.createdAt as Record<string, Date>).lte = end;
        }

        const count = await prisma.transaction.count({ where });

        return reply.send({
            count,
            period: {
                start: start?.toISOString() ?? null,
                end: end?.toISOString() ?? null
            }
        });
    });
}
