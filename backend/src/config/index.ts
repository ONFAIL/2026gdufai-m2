import { resolve } from 'node:path';
import {
  loadAiConfig,
  type AiConfig,
  type AiEndpointConfig,
  type AsrEndpointConfig,
  type AsrProtocol,
  type OcrEndpointConfig,
  type OcrProtocol
} from './ai.ts';

export {
  loadAiConfig,
  type AiConfig,
  type AiEndpointConfig,
  type AsrEndpointConfig,
  type AsrProtocol,
  type OcrEndpointConfig,
  type OcrProtocol
};

/** 应用配置。业务代码只从这里取配置，不直接读 process.env。 */
export interface AppConfig {
  readonly port: number;
  readonly nodeEnv: string;
  readonly databasePath: string;
  readonly uploadDir: string;
  readonly authToken: string | null;
  /** 单用户演示的唯一用户；入站 userId 必须与之一致，读接口不接受 userId。 */
  readonly demoUserId: string;
  /** 外部 AI 服务端点配置；测试构造最小 AppConfig 时可省略。 */
  readonly ai?: AiConfig;
}

function readPositiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`环境变量 ${name} 必须是正整数，当前值: ${value}`);
  }
  return parsed;
}

/**
 * 读取并校验环境变量。
 * `.env` 由启动脚本的 `--env-file-if-exists` 注入，这里只负责校验与默认值。
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const authToken = env.APP_AUTH_TOKEN;
  const demoUserId = env.DEMO_USER_ID?.trim();
  return {
    port: readPositiveInt(env.PORT, 3000, 'PORT'),
    nodeEnv: env.NODE_ENV ?? 'development',
    databasePath: resolve(env.DATABASE_PATH ?? './data/app.db'),
    uploadDir: resolve(env.UPLOAD_DIR ?? './uploads'),
    authToken: authToken && authToken !== 'change-me' ? authToken : null,
    demoUserId: demoUserId !== undefined && demoUserId !== '' ? demoUserId : 'u_001',
    ai: loadAiConfig(env)
  };
}
