import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/index.ts';
import type { Db } from './db/client.ts';
import { registerLedgerRoutes } from './modules/ledger/routes.ts';
import { AppError } from './shared/errors.ts';

export interface AppDeps {
  readonly config: AppConfig;
  readonly db: Db;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

/**
 * 创建 Fastify 实例。测试用 `app.inject` 直接调用，不监听端口。
 * 业务路由在后续 PR 中按契约分批注册。
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: { level: deps.config.nodeEnv === 'development' ? 'info' : 'warn' }
  });

  app.decorate('db', deps.db);

  void app.register(registerLedgerRoutes);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          field: error.field,
          ...(error.details === undefined ? {} : { details: error.details })
        }
      });
      return;
    }
    request.log.error({ err: error }, 'unhandled error');
    void reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' }
    });
  });

  return app;
}
