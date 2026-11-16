import type {
  BudgetItem,
  CategoryItem,
  TransactionItem,
  TransactionListResponse,
  TransactionQuery,
} from '../types/contract';
import { MOCK_BUDGETS_BY_MONTH, MOCK_CATEGORIES, MOCK_TRANSACTIONS } from './data';

const storeTransactions: TransactionItem[] = [...MOCK_TRANSACTIONS];

/**
 * 读取当前内存账单列表供统计模块聚合使用。
 */
export function getMockTransactions(): readonly TransactionItem[] {
  return storeTransactions;
}

/**
 * 向本地 mock 账单库追加一条已确认记录。
 * @param item 账单条目
 */
export function appendMockTransaction(item: TransactionItem): void {
  storeTransactions.unshift(item);
}

/**
 * 返回全量预设类别字典。
 */
export function mockGetCategories(): CategoryItem[] {
  const list: CategoryItem[] = [];
  for (const cat of MOCK_CATEGORIES) {
    list.push({ ...cat });
  }
  return list;
}

/**
 * 模拟游标分页查询账单明细。
 * @param query 查询筛选参数
 */
export function mockListTransactions(query: TransactionQuery): TransactionListResponse {
  const limit = query.limit ?? 10;
  const filtered: TransactionItem[] = [];
  let totalExpenseCents = 0;
  let totalIncomeCents = 0;

  for (const tx of storeTransactions) {
    if (query.categoryId !== null && query.categoryId !== undefined && tx.category.id !== query.categoryId) {
      continue;
    }
    if (query.direction && tx.direction !== query.direction) {
      continue;
    }
    if (query.from && tx.occurredDate < query.from) {
      continue;
    }
    if (query.to && tx.occurredDate > query.to) {
      continue;
    }
    filtered.push(tx);
    if (tx.direction === 'expense') {
      totalExpenseCents += tx.amountCents;
    } else {
      totalIncomeCents += tx.amountCents;
    }
  }

  const startIdx = query.cursor ? Math.max(0, Number(query.cursor) || 0) : 0;
  const items = filtered.slice(startIdx, startIdx + limit);
  const nextIdx = startIdx + items.length;
  const hasMore = nextIdx < filtered.length;

  return {
    filter: {
      categoryId: query.categoryId ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      direction: query.direction ?? null,
    },
    summary: {
      totalExpenseCents,
      totalIncomeCents,
      count: filtered.length,
    },
    items,
    page: {
      limit,
      hasMore,
      nextCursor: hasMore ? String(nextIdx) : null,
    },
    meta: {
      timezone: 'Asia/Shanghai',
      isEmpty: filtered.length === 0,
    },
  };
}

/**
 * 查询指定月份预算列表。
 * @param month 月份（YYYY-MM）
 */
export function mockGetBudgets(month: string): BudgetItem[] {
  const list = MOCK_BUDGETS_BY_MONTH[month] ?? [];
  const cloned: BudgetItem[] = [];
  for (const b of list) {
    cloned.push({ ...b, category: b.category ? { ...b.category } : null });
  }
  return cloned;
}
