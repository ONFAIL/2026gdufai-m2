import { nowIsoShanghai } from '../../shared/time.ts';
import type { Db } from '../client.ts';

/**
 * 幂等写入演示用户。
 * 契约 §0.1：本期单用户演示，用户由服务端预置，入站 userId 必须等于 DEMO_USER_ID。
 */
export function seedDemoUser(db: Db, userId: string): void {
  db.prepare('INSERT OR IGNORE INTO users (id, nickname, created_at) VALUES (?, ?, ?)').run(
    userId,
    userId,
    nowIsoShanghai()
  );
}
