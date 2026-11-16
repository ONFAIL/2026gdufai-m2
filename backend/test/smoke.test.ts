import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import type { AppConfig } from '../src/config/index.ts';
import { openDatabase } from '../src/db/client.ts';

const config: AppConfig = {
  port: 0,
  nodeEnv: 'test',
  databasePath: ':memory:',
  uploadDir: './uploads',
  authToken: null
};

describe('app 工厂', () => {
  it('可以创建、就绪并关闭 Fastify 实例', async () => {
    const db = openDatabase(':memory:');
    const app = buildApp({ config, db });
    await app.ready();
    expect(app.db).toBe(db);
    await app.close();
    db.close();
  });
});
