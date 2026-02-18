import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { connectDB, disconnectDB, prisma } from '../db.js';
import { intentsRoutes } from '../routes/intents.js';
import { worldRoutes } from '../routes/world.js';
import { citiesRoutes } from '../routes/cities.js';
import { actorsRoutes } from '../routes/actors.js';
import { eventsRoutes } from '../routes/events.js';
import { walletRoutes } from '../routes/wallet.js';
import { businessRoutes } from '../routes/businesses.js';
import { economyRoutes } from '../routes/economy.js';
import { marketRoutes } from '../routes/market.js';
import { governanceRoutes } from '../routes/governance.js';
import { narrativeRoutes } from '../routes/narrative.js';
import { leaderboardsRoutes } from '../routes/leaderboards.js';
import { feedRoutes } from '../routes/feed.js';
import { constructionRoutes } from '../routes/construction.js';
import { generateConstructionQuotes, processConstructionProjects } from '../engine/construction.engine.js';
import { IntentType } from '../types/intent.types.js';
import { computeEconomicSnapshots, computeGodEconomicReport } from '../services/economy-snapshot.service.js';
import fs from 'fs';
import path from 'path';

type TestResult = {
    name: string;
    status: number;
    ok: boolean;
    details?: string;
};

async function main() {
    await connectDB();

    const app = Fastify({ logger: false });
    await app.register(cors, { origin: true });

    app.get('/health', async () => ({ status: 'ok' }));
    await app.register(intentsRoutes);
    await app.register(worldRoutes);
    await app.register(citiesRoutes);
    await app.register(actorsRoutes);
    await app.register(eventsRoutes);
    await app.register(walletRoutes);
    await app.register(businessRoutes);
    await app.register(economyRoutes);
    await app.register(marketRoutes);
    await app.register(governanceRoutes);
    await app.register(narrativeRoutes);
    await app.register(leaderboardsRoutes);
    await app.register(feedRoutes);
    await app.register(constructionRoutes);

    const results: TestResult[] = [];

    const worldState = await prisma.worldState.findFirst({ where: { id: 1 } });
    const currentTick = worldState?.tick ?? 0;
    const city = await prisma.city.findFirst();
    const agent = await prisma.actor.findFirst({ where: { kind: 'agent', frozen: false }, include: { wallet: true, agentState: true } });
    const otherAgent = await prisma.actor.findFirst({ where: { kind: 'agent', frozen: false, id: { not: agent?.id ?? '' } } });

    if (!city || !agent) {
        throw new Error('Missing city or agent for tests. Run genesis first.');
    }

    await computeEconomicSnapshots(currentTick);
    await computeGodEconomicReport(currentTick);

    const ensureLot = async (ownerId: string, cityId: string) => {
        const existing = await prisma.property.findFirst({
            where: { ownerId, cityId, isEmptyLot: true, underConstruction: false }
        });
        if (existing) return existing;
        return prisma.property.create({
            data: {
                cityId,
                ownerId,
                housingTier: 'house',
                rentPrice: 0,
                forRent: false,
                forSale: false,
                isEmptyLot: true,
                lotType: 'SUBURBAN_LOT'
            }
        });
    };

    const clientLot = await ensureLot(agent.id, city.id);
    const cityLot = await ensureLot(agent.id, city.id);
    const businessLot = await ensureLot(otherAgent?.id ?? agent.id, city.id);

    let constructionBusiness = await prisma.business.findFirst({
        where: { businessType: 'CONSTRUCTION', cityId: city.id }
    });
    if (!constructionBusiness) {
        constructionBusiness = await prisma.business.create({
            data: {
                name: `Constructor-${Date.now()}`,
                businessType: 'CONSTRUCTION',
                businessSubtype: 'GENERAL',
                ownerId: otherAgent?.id ?? agent.id,
                cityId: city.id,
                landId: businessLot.id,
                reputation: 650,
                level: 1,
                maxEmployees: 3,
                treasury: 0,
                qualityScore: 50,
                isOpen: true,
                customerVisitsToday: 0,
                dailyRevenue: 0,
                dailyExpenses: 0,
                cumulativeRevenue: 0,
                status: 'ACTIVE',
                insolvencyDays: 0,
                frozen: false,
                bankruptcyCount: 0,
                foundedTick: currentTick,
                ownerLastWorkedTick: currentTick
            }
        });
    } else if (constructionBusiness.ownerLastWorkedTick === null) {
        await prisma.business.update({
            where: { id: constructionBusiness.id },
            data: { ownerLastWorkedTick: currentTick }
        });
    }

    const existingEmployment = await prisma.privateEmployment.findFirst({
        where: { businessId: constructionBusiness.id, status: 'ACTIVE' }
    });
    if (!existingEmployment && otherAgent) {
        await prisma.privateEmployment.create({
            data: {
                businessId: constructionBusiness.id,
                agentId: otherAgent.id,
                salaryDaily: 500,
                hiredTick: currentTick,
                status: 'ACTIVE'
            }
        });
    }

    const run = async (name: string, opts: Parameters<typeof app.inject>[0], expectedStatus = 200) => {
        const res = await app.inject(opts);
        results.push({
            name,
            status: res.statusCode,
            ok: res.statusCode === expectedStatus,
            details: res.statusCode === expectedStatus ? undefined : res.body
        });
        return res;
    };

    await run('health', { method: 'GET', url: '/health' });
    await run('world.state', { method: 'GET', url: '/api/v1/world/state' });
    await run('cities.list', { method: 'GET', url: '/api/v1/cities' });
    await run('cities.get', { method: 'GET', url: `/api/v1/cities/${city.id}` });
    await run('cities.economy', { method: 'GET', url: `/api/v1/cities/${city.id}/economy` });
    await run('cities.properties.summary', { method: 'GET', url: `/api/v1/cities/${city.id}/properties/summary` });
    await run('cities.analytics.economy', { method: 'GET', url: `/api/v1/cities/${city.id}/analytics/economy` });
    await run('cities.analytics.social', { method: 'GET', url: `/api/v1/cities/${city.id}/analytics/social` });
    await run('cities.analytics.political', { method: 'GET', url: `/api/v1/cities/${city.id}/analytics/political` });
    await run('cities.analytics.history', { method: 'GET', url: `/api/v1/cities/${city.id}/analytics/history` });
    await run('cities.trending', { method: 'GET', url: `/api/v1/cities/${city.id}/trending-agents` });

    await run('actors.get', { method: 'GET', url: `/api/v1/actors/${agent.id}` });
    await run('actors.state', { method: 'GET', url: `/api/v1/actors/${agent.id}/state` });
    await run('actors.personality', { method: 'GET', url: `/api/v1/actors/${agent.id}/personality` });
    await run('actors.emotions', { method: 'GET', url: `/api/v1/actors/${agent.id}/emotions` });
    await run('actors.memory', { method: 'GET', url: `/api/v1/actors/${agent.id}/memory` });
    await run('actors.memories', { method: 'GET', url: `/api/v1/actors/${agent.id}/memories?limit=10` });
    await run('actors.markers', { method: 'GET', url: `/api/v1/actors/${agent.id}/markers` });
    await run('actors.relationships', { method: 'GET', url: `/api/v1/actors/${agent.id}/relationships` });
    await run('actors.friends', { method: 'GET', url: `/api/v1/actors/${agent.id}/friends` });
    await run('actors.enemies', { method: 'GET', url: `/api/v1/actors/${agent.id}/enemies` });
    await run('actors.alliances', { method: 'GET', url: `/api/v1/actors/${agent.id}/alliances` });
    await run('actors.goals', { method: 'GET', url: `/api/v1/actors/${agent.id}/goals` });
    await run('actors.persona', { method: 'GET', url: `/api/v1/actors/${agent.id}/persona` });
    await run('actors.titles', { method: 'GET', url: `/api/v1/actors/${agent.id}/titles` });
    await run('actors.milestones', { method: 'GET', url: `/api/v1/actors/${agent.id}/milestones` });
    await run('actors.profile', { method: 'GET', url: `/api/v1/actors/${agent.id}/profile` });
    await run('actors.history.wealth', { method: 'GET', url: `/api/v1/actors/${agent.id}/history/wealth` });
    await run('actors.wealth.breakdown', { method: 'GET', url: `/api/v1/actors/${agent.id}/wealth-breakdown` });
    await run('actors.search', { method: 'GET', url: `/api/v1/actors/search?city_id=${city.id}` });
    await run('actors.trending', { method: 'GET', url: `/api/v1/actors/trending` });

    await run('events.list', { method: 'GET', url: `/api/v1/events?limit=5` });
    await run('events.list.search', { method: 'GET', url: `/api/v1/events?search=${encodeURIComponent(agent.name)}&limit=5` });
    await run('events.list.city', { method: 'GET', url: `/api/v1/events?cityId=${city.id}&limit=5` });
    await run('wallet.get', { method: 'GET', url: `/api/v1/wallet/${agent.id}` });
    await run('wallet.tx', { method: 'GET', url: `/api/v1/wallet/${agent.id}/transactions` });
    await run('wallet.withdrawals', { method: 'GET', url: `/api/v1/wallet/${agent.id}/withdrawals` });
    await run('wallet.sync', { method: 'POST', url: `/api/v1/wallet/${agent.id}/sync` });
    await run('wallet.import.bad', { method: 'POST', url: `/api/v1/wallet/import`, payload: {} }, 400);

    await run('business.list', { method: 'GET', url: `/api/v1/businesses?cityId=${city.id}` });
    await run('business.listings', { method: 'GET', url: `/api/v1/businesses/listings` });
    await run('business.get', { method: 'GET', url: `/api/v1/businesses/${constructionBusiness.id}` });
    await run('business.events', { method: 'GET', url: `/api/v1/businesses/${constructionBusiness.id}/events` });
    await run('business.payroll', { method: 'GET', url: `/api/v1/businesses/${constructionBusiness.id}/payroll` });
    await run('business.loans', { method: 'GET', url: `/api/v1/businesses/${constructionBusiness.id}/loans` });
    await run('business.treasury', { method: 'GET', url: `/api/v1/businesses/${constructionBusiness.id}/treasury` });
    await run('business.financials', { method: 'GET', url: `/api/v1/businesses/${constructionBusiness.id}/financials` });
    await run('business.rep.history', { method: 'GET', url: `/api/v1/businesses/${constructionBusiness.id}/reputation-history` });
    await run('business.customers', { method: 'GET', url: `/api/v1/businesses/${constructionBusiness.id}/customers` });
    await run('business.competitors', { method: 'GET', url: `/api/v1/businesses/${constructionBusiness.id}/competitors` });

    await run('economy.global', { method: 'GET', url: `/api/v1/economy/global` });
    await run('economy.transactions.count', { method: 'GET', url: `/api/v1/economy/transactions/count` });
    await run('market.listings', { method: 'GET', url: `/api/v1/market/listings?cityId=${city.id}&limit=5` });
    await run('governance.proposals', { method: 'GET', url: `/api/v1/governance/${city.id}/proposals?limit=5` });
    await run('governance.elections', { method: 'GET', url: `/api/v1/governance/${city.id}/elections` });
    await run('governance.donations', { method: 'GET', url: `/api/v1/governance/${city.id}/donations?limit=5` });
    await run('narrative.events', { method: 'GET', url: `/api/v1/narrative/events` });
    await run('narrative.scandals', { method: 'GET', url: `/api/v1/narrative/scandals` });
    await run('narrative.story-arcs', { method: 'GET', url: `/api/v1/narrative/story-arcs` });
    await run('narrative.highlights', { method: 'GET', url: `/api/v1/narrative/daily-highlights` });
    await run('narrative.biography', { method: 'GET', url: `/api/v1/actors/${agent.id}/biography` });

    await run('feed.live', { method: 'GET', url: `/api/v1/feed/live` });
    await run('leaderboard.wealth', { method: 'GET', url: `/api/v1/leaderboards/wealth` });
    await run('hall.of.fame', { method: 'GET', url: `/api/v1/hall-of-fame` });

    // Construction flow: request -> auto-quote -> accept -> complete
    await run('intent.request.construction', {
        method: 'POST',
        url: '/api/v1/intents',
        payload: {
            actorId: agent.id,
            type: IntentType.INTENT_REQUEST_CONSTRUCTION,
            params: {
                lotId: clientLot.id,
                buildingType: 'CONDO',
                maxBudget: 30000
            }
        }
    }, 201);
    await generateConstructionQuotes(currentTick + 1);
    const quotesRes = await run('construction.quotes', { method: 'GET', url: `/api/v1/construction/quotes?lot_id=${clientLot.id}` });
    const quotesBody = quotesRes.json() as { quotes: { id: string; estimatedTicks: number }[] };
    if (quotesBody.quotes.length > 0) {
        const quoteId = quotesBody.quotes[0].id;
        await run('intent.accept.construction', {
            method: 'POST',
            url: '/api/v1/intents',
            payload: {
                actorId: agent.id,
                type: IntentType.INTENT_ACCEPT_CONSTRUCTION_QUOTE,
                params: { quoteId }
            }
        }, 201);
        const project = await prisma.constructionProject.findFirst({ where: { lotId: clientLot.id } });
        if (project?.estimatedCompletionTick) {
            await processConstructionProjects(project.estimatedCompletionTick);
        }
        if (project) {
            await run('construction.project.get', { method: 'GET', url: `/api/v1/construction/projects/${project.id}` });
        }
    }

    // City fallback construction
    await run('intent.request.construction.city', {
        method: 'POST',
        url: '/api/v1/intents',
        payload: {
            actorId: agent.id,
            type: IntentType.INTENT_REQUEST_CONSTRUCTION,
            params: {
                lotId: cityLot.id,
                buildingType: 'CONDO',
                maxBudget: 30000,
                preferredConstructorId: 'city'
            }
        }
    }, 201);

    await run('construction.projects', { method: 'GET', url: `/api/v1/construction/projects` });

    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const repoRoot = path.resolve(process.cwd(), '..', '..');
    const reportDir = path.join(repoRoot, 'docs', 'reviews', '07-02-26');
    const reportPath = path.join(reportDir, `${timestamp}_full-endpoint-test.md`);
    fs.mkdirSync(reportDir, { recursive: true });
    const reportLines = [
        `# Full Endpoint Test Report`,
        `- Timestamp: ${new Date().toISOString()}`,
        `- Passed: ${passed}`,
        `- Failed: ${failed.length}`,
        ``,
        `## Results`,
        ...results.map(r => `- ${r.ok ? '✅' : '❌'} ${r.name} (${r.status})${r.details ? `: ${r.details}` : ''}`),
    ];

    fs.writeFileSync(reportPath, reportLines.join('\n'));

    if (failed.length > 0) {
        console.error('Failures:', failed);
        process.exitCode = 1;
    }

    await app.close();
    await disconnectDB();
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
