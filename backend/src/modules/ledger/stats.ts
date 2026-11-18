import type { Db } from '../../db/client.ts';
import { AppError } from '../../shared/errors.ts';
import { nowIsoShanghai, toShanghaiDate, todayShanghai } from '../../shared/time.ts';
import type { Direction } from './types.ts';

export type StatsDimension = 'day' | 'month' | 'year' | 'recent7';
export type StatsDirection = 'all' | 'expense' | 'income';
export type StatsOrder = 'asc' | 'desc';

export interface StatsQuery {
  readonly dimension: StatsDimension;
  readonly date?: string;
  readonly month?: string;
  readonly year?: string;
  readonly breakdownBy?: 'category';
  readonly direction?: StatsDirection;
  readonly categoryIds?: number[];
  readonly order?: StatsOrder;
}

export interface StatsCategoryRow {
  categoryId: number;
  name: string;
  kind: Direction;
  color: string;
  custom: boolean;
  totalCents: number;
  count: number;
  ratio: number;
}

export interface StatsBucket {
  period: string;
  expenseCents: number;
  incomeCents: number;
  netCents: number;
  count: number;
  categories: StatsCategoryRow[];
}

export interface TopCategory {
  categoryId: number;
  name: string;
  totalCents: number;
  ratio: number;
}

export interface StatsResult {
  dimension: StatsDimension;
  range: { start: string; end: string };
  direction: StatsDirection;
  summary: {
    expenseCents: number;
    incomeCents: number;
    netCents: number;
    count: number;
    topCategory: TopCategory | null;
  };
  buckets: StatsBucket[];
  meta: {
    unit: 'cent';
    basis: { dateField: 'occurred_date'; timezone: 'Asia/Shanghai'; includeVoid: false };
    generatedAt: string;
    isEmpty: boolean;
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

function invalid(message: string): never {
  throw new AppError('INVALID_DIMENSION_PARAM', 422, message);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 严格校验 YYYY-MM-DD 是真实日历日期（防止 2 月 31 日被 Date.parse 滚动）。 */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year as number, (month as number) - 1, day as number));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function shiftDate(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00+08:00`) + days * 24 * 60 * 60 * 1000;
  return toShanghaiDate(new Date(time).toISOString());
}

function resolveRange(query: StatsQuery): { start: string; end: string; buckets: string[] } {
  switch (query.dimension) {
    case 'day': {
      if (query.date === undefined || !isRealDate(query.date)) {
        invalid('dimension=day 需要合法的 date（YYYY-MM-DD）');
      }
      if (query.month !== undefined || query.year !== undefined) {
        invalid('dimension=day 不接受 month/year 参数');
      }
      return { start: query.date, end: query.date, buckets: [query.date] };
    }
    case 'month': {
      if (query.month === undefined || !MONTH_RE.test(query.month)) {
        invalid('dimension=month 需要合法的 month（YYYY-MM）');
      }
      if (query.date !== undefined || query.year !== undefined) {
        invalid('dimension=month 不接受 date/year 参数');
      }
      const [yearText, monthText] = query.month.split('-');
      const year = Number(yearText);
      const month = Number(monthText);
      if (month < 1 || month > 12) {
        invalid('month 参数月份必须在 01–12 之间');
      }
      const lastDay = String(daysInMonth(year, month)).padStart(2, '0');
      return {
        start: `${query.month}-01`,
        end: `${query.month}-${lastDay}`,
        buckets: [query.month]
      };
    }
    case 'year': {
      if (query.year === undefined || !YEAR_RE.test(query.year)) {
        invalid('dimension=year 需要合法的 year（YYYY）');
      }
      if (query.date !== undefined || query.month !== undefined) {
        invalid('dimension=year 不接受 date/month 参数');
      }
      return { start: `${query.year}-01-01`, end: `${query.year}-12-31`, buckets: [query.year] };
    }
    case 'recent7': {
      if (query.date !== undefined || query.month !== undefined || query.year !== undefined) {
        invalid('dimension=recent7 不接受 date/month/year 参数');
      }
      const end = todayShanghai();
      const buckets = [-6, -5, -4, -3, -2, -1, 0].map((offset) => shiftDate(end, offset));
      return { start: buckets[0] as string, end, buckets };
    }
    default:
      return invalid(`不支持的 dimension: ${String(query.dimension)}`);
  }
}

function buildPeriod(date: string, dimension: StatsDimension): string {
  if (dimension === 'day' || dimension === 'recent7') {
    return date;
  }
  if (dimension === 'month') {
    return date.slice(0, 7);
  }
  return date.slice(0, 4);
}

interface AggregateRow {
  occurred_date: string;
  category_id: number | null;
  direction: Direction;
  cents: number;
  count: number;
}

interface CategoryMeta {
  id: number;
  name: string;
  kind: Direction;
  color: string;
  isPreset: boolean;
}

interface BucketAccumulator {
  expenseCents: number;
  incomeCents: number;
  count: number;
  categories: Map<number, { cents: number; count: number }>;
}

function emptyAccumulator(): BucketAccumulator {
  return { expenseCents: 0, incomeCents: 0, count: 0, categories: new Map() };
}

/** 按契约 §2.2 计算统计结果。聚合只在服务端做，前端与 M3 不重复计算。 */
export function buildStats(db: Db, userId: string, query: StatsQuery): StatsResult {
  const range = resolveRange(query);
  const direction = query.direction ?? 'all';
  const order = query.order ?? 'asc';

  const conditions = [
    'user_id = ?',
    "status = 'confirmed'",
    // 退款/还款记录保留但为中性记录，不计入收支统计
    "entry_type = 'normal'",
    'occurred_date BETWEEN ? AND ?'
  ];
  const params: Array<string | number> = [userId, range.start, range.end];

  if (direction !== 'all') {
    conditions.push('direction = ?');
    params.push(direction);
  }
  if (query.categoryIds !== undefined && query.categoryIds.length > 0) {
    conditions.push(`category_id IN (${query.categoryIds.map(() => '?').join(', ')})`);
    params.push(...query.categoryIds);
  }

  const rows = db
    .prepare(
      `SELECT occurred_date, category_id, direction, SUM(amount_cents) AS cents, COUNT(*) AS count
         FROM transactions
        WHERE ${conditions.join(' AND ')}
        GROUP BY occurred_date, category_id, direction`
    )
    .all(...params) as AggregateRow[];

  // isEmpty 表示「区间内是否有任何记录」（含中性记录）；summary.count 仍只算 normal。
  const hasAnyRecord =
    db
      .prepare(
        `SELECT 1 AS hit FROM transactions
          WHERE user_id = ? AND status = 'confirmed' AND occurred_date BETWEEN ? AND ? LIMIT 1`
      )
      .get(userId, range.start, range.end) !== undefined;

  const categoryMeta = new Map<number, CategoryMeta>();
  const categoryRows = db
    .prepare('SELECT id, name, kind, color, is_preset FROM categories')
    .all() as Array<{ id: number; name: string; kind: Direction; color: string; is_preset: number }>;
  for (const row of categoryRows) {
    categoryMeta.set(row.id, {
      id: row.id,
      name: row.name,
      kind: row.kind,
      color: row.color,
      isPreset: row.is_preset === 1
    });
  }

  const bucketMap = new Map<string, BucketAccumulator>();
  for (const period of range.buckets) {
    bucketMap.set(period, emptyAccumulator());
  }
  bucketMap.set(range.buckets[0] as string, bucketMap.get(range.buckets[0] as string) ?? emptyAccumulator());

  for (const row of rows) {
    const period = buildPeriod(row.occurred_date, query.dimension);
    const accumulator = bucketMap.get(period) ?? emptyAccumulator();
    bucketMap.set(period, accumulator);
    accumulator.count += row.count;
    if (row.direction === 'expense') {
      accumulator.expenseCents += row.cents;
    } else {
      accumulator.incomeCents += row.cents;
    }
    if (row.category_id !== null) {
      const current = accumulator.categories.get(row.category_id) ?? { cents: 0, count: 0 };
      current.cents += row.cents;
      current.count += row.count;
      accumulator.categories.set(row.category_id, current);
    }
  }

  const summary = { expenseCents: 0, incomeCents: 0, count: 0 };
  const allCategories = new Map<number, { cents: number; count: number }>();
  for (const accumulator of bucketMap.values()) {
    summary.expenseCents += accumulator.expenseCents;
    summary.incomeCents += accumulator.incomeCents;
    summary.count += accumulator.count;
    for (const [categoryId, value] of accumulator.categories) {
      const current = allCategories.get(categoryId) ?? { cents: 0, count: 0 };
      current.cents += value.cents;
      current.count += value.count;
      allCategories.set(categoryId, current);
    }
  }

  const buckets: StatsBucket[] = [...bucketMap.entries()].map(([period, accumulator]) => {
    const categories: StatsCategoryRow[] = [];
    if (query.breakdownBy === 'category') {
      for (const [categoryId, value] of accumulator.categories) {
        const meta = categoryMeta.get(categoryId);
        if (meta === undefined) {
          continue;
        }
        const denominator = meta.kind === 'expense' ? accumulator.expenseCents : accumulator.incomeCents;
        categories.push({
          categoryId,
          name: meta.name,
          kind: meta.kind,
          color: meta.color,
          custom: !meta.isPreset,
          totalCents: value.cents,
          count: value.count,
          ratio: denominator === 0 ? 0 : Number((value.cents / denominator).toFixed(3))
        });
      }
      categories.sort((a, b) => (order === 'asc' ? a.totalCents - b.totalCents : b.totalCents - a.totalCents));
    }
    return {
      period,
      expenseCents: accumulator.expenseCents,
      incomeCents: accumulator.incomeCents,
      netCents: accumulator.incomeCents - accumulator.expenseCents,
      count: accumulator.count,
      categories
    };
  });

  if (query.dimension === 'recent7') {
    buckets.sort((a, b) => (order === 'asc' ? a.period.localeCompare(b.period) : b.period.localeCompare(a.period)));
  }

  // topCategory 取「当前方向」的最高类别；direction=all 时按支出侧取，ratio 用同方向分母。
  const topKind: Direction = direction === 'income' ? 'income' : 'expense';
  const topDenominator = topKind === 'expense' ? summary.expenseCents : summary.incomeCents;
  let topCategory: TopCategory | null = null;
  for (const [categoryId, value] of allCategories) {
    const meta = categoryMeta.get(categoryId);
    if (meta === undefined || meta.kind !== topKind) {
      continue;
    }
    if (topCategory === null || value.cents > topCategory.totalCents) {
      topCategory = {
        categoryId,
        name: meta.name,
        totalCents: value.cents,
        ratio: topDenominator === 0 ? 0 : Number((value.cents / topDenominator).toFixed(3))
      };
    }
  }

  return {
    dimension: query.dimension,
    range: { start: range.start, end: range.end },
    direction,
    summary: {
      expenseCents: summary.expenseCents,
      incomeCents: summary.incomeCents,
      netCents: summary.incomeCents - summary.expenseCents,
      count: summary.count,
      topCategory
    },
    buckets,
    meta: {
      unit: 'cent',
      basis: { dateField: 'occurred_date', timezone: 'Asia/Shanghai', includeVoid: false },
      generatedAt: nowIsoShanghai(),
      isEmpty: !hasAnyRecord
    }
  };
}
