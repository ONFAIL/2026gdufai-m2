import { buildApp } from './app.ts';
import { loadConfig } from './config/index.ts';
import { openDatabase } from './db/client.ts';
import { seedCategories } from './db/seed/categories.ts';

const config = loadConfig();
const db = openDatabase(config.databasePath);
seedCategories(db);

const app = buildApp({ config, db });

async function shutdown(signal: string): Promise<void> {
  app.log.info(`收到 ${signal}，正在关闭服务`);
  await app.close();
  db.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
