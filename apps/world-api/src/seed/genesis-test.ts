import 'dotenv/config';

process.env.GENESIS_MODE = process.env.GENESIS_MODE || 'test';
process.env.GENESIS_CITY_VAULT_SEED = process.env.GENESIS_CITY_VAULT_SEED || '50000';
process.env.GENESIS_SKIP_AGENTS = process.env.GENESIS_SKIP_AGENTS || 'true';

await import('./genesis.js');
