import type { FastifyInstance } from 'fastify';
import { invalidBatch } from '../../shared/errors.ts';
import { processBatch } from './intake.ts';
import { parseBatch } from './validation.ts';

/** 注册 M2 导入路由：接收模块 1 的批次 JSON 并逐条返回处理结果。 */
export async function registerLedgerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/transactions/import', async (request, reply) => {
    const parsed = parseBatch(request.body);
    if (!parsed.ok) {
      throw invalidBatch(parsed.message, parsed.field);
    }
    const result = processBatch(app.db, parsed.batch);
    return reply.status(201).send(result);
  });
}
