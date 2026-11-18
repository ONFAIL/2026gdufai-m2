import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import type { AppConfig } from '../../src/config/index.ts';
import { openDatabase } from '../../src/db/client.ts';
import { seedCategories } from '../../src/db/seed/categories.ts';
import { seedDemoUser } from '../../src/db/seed/users.ts';

const config: AppConfig = {
  port: 0,
  nodeEnv: 'test',
  databasePath: ':memory:',
  uploadDir: './uploads',
  authToken: 'secret-token',
  demoUserId: 'u_001'
};

const db = openDatabase(':memory:');
seedCategories(db);
seedDemoUser(db, config.demoUserId);
const app = buildApp({ config, db });

afterAll(async () => {
  await app.close();
  db.close();
});

describe('鉴权中间件', () => {
  it('缺少 Bearer 返回 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/categories' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('错误的 Token 返回 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/categories',
      headers: { authorization: 'Bearer wrong' }
    });
    expect(response.statusCode).toBe(401);
  });

  it('正确的 Token 放行（空批次按业务错误返回 400）', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transactions/import',
      headers: { authorization: 'Bearer secret-token' },
      payload: {}
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_BATCH' } });
  });
});
