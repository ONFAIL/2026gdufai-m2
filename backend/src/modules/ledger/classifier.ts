import type { CategoryRow, Classification, Direction, UserCategoryRule } from './types.ts';

/** 分类置信度，低于 0.75 触发 LOW_CONFIDENCE_CATEGORY。 */
const CONFIDENCE = {
  userRule: 0.98,
  custom: 0.92,
  preset: 0.9,
  fallback: 0.3
} as const;

export interface ClassifyContext {
  readonly categories: readonly CategoryRow[];
  readonly userRules: readonly UserCategoryRule[];
}

export interface ClassifyInput {
  readonly merchant: string | null;
  readonly rawText: string;
  readonly direction: Direction | null;
}

function matchesDirection(category: CategoryRow, direction: Direction | null): boolean {
  return direction === null || category.kind === direction;
}

function findKeywordMatch(
  categories: readonly CategoryRow[],
  haystack: string,
  direction: Direction | null
): CategoryRow | null {
  let best: { category: CategoryRow; score: number } | null = null;

  for (const category of categories) {
    if (!matchesDirection(category, direction)) {
      continue;
    }
    for (const keyword of category.keywords) {
      const needle = keyword.trim().toLowerCase();
      if (needle === '' || !haystack.includes(needle)) {
        continue;
      }
      if (
        best === null ||
        needle.length > best.score ||
        // 关键词长度相同：自定义类别优先，其次 id 小的优先
        (needle.length === best.score &&
          (!category.isPreset && best.category.isPreset)) ||
        (needle.length === best.score &&
          category.isPreset === best.category.isPreset &&
          category.id < best.category.id)
      ) {
        best = { category, score: needle.length };
      }
    }
  }

  return best?.category ?? null;
}

function findFallback(categories: readonly CategoryRow[], direction: Direction | null): CategoryRow | null {
  const wantedKind: Direction = direction ?? 'expense';
  const names = wantedKind === 'expense' ? ['其他'] : ['其他收入'];
  return (
    categories.find((category) => category.kind === wantedKind && names.includes(category.name)) ?? null
  );
}

/**
 * 规则分类引擎。
 * 优先级：用户历史规则（0.98）→ 自定义类别关键词（0.92）→ 预设类别关键词（0.90）→ 兜底「其他」（0.30）。
 * 方向未定时跨收支两侧匹配，由类别 kind 决定最终方向；不调用 LLM，LLM 兜底在后续 PR 接入。
 */
export function classify(input: ClassifyInput, context: ClassifyContext): Classification {
  const haystack = `${input.merchant ?? ''} ${input.rawText}`.toLowerCase();
  const byId = new Map(context.categories.map((category) => [category.id, category]));

  let bestRule: { pattern: string; categoryId: number } | null = null;
  for (const rule of context.userRules) {
    const pattern = rule.pattern.trim().toLowerCase();
    if (pattern === '' || !haystack.includes(pattern)) {
      continue;
    }
    if (bestRule === null || pattern.length > bestRule.pattern.length) {
      bestRule = { pattern, categoryId: rule.categoryId };
    }
  }
  if (bestRule !== null) {
    const category = byId.get(bestRule.categoryId);
    if (category !== undefined && matchesDirection(category, input.direction)) {
      return { categoryId: category.id, confidence: CONFIDENCE.userRule, source: 'user_rule' };
    }
  }

  const keywordMatch = findKeywordMatch(context.categories, haystack, input.direction);
  if (keywordMatch !== null) {
    return {
      categoryId: keywordMatch.id,
      confidence: keywordMatch.isPreset ? CONFIDENCE.preset : CONFIDENCE.custom,
      source: 'rule'
    };
  }

  const fallback = findFallback(context.categories, input.direction);
  return { categoryId: fallback?.id ?? null, confidence: CONFIDENCE.fallback, source: 'fallback' };
}
