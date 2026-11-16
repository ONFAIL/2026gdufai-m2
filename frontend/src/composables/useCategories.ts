import { ref } from 'vue';
import type { CategoryItem } from '../types/contract';
import { getCategories } from '../api/index';

const cachedCategories = ref<CategoryItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let inflight: Promise<void> | null = null;

/**
 * 跨页面共享的类别字典缓存 composable，替代全局状态库。
 */
export function useCategories() {
  async function loadCategories(force = false): Promise<void> {
    if (!force && cachedCategories.value.length > 0) {
      return;
    }
    if (inflight) {
      return inflight;
    }
    loading.value = true;
    error.value = null;
    inflight = getCategories()
      .then((list) => {
        cachedCategories.value = list;
      })
      .catch((err: unknown) => {
        error.value = err instanceof Error ? err.message : '加载类别失败';
      })
      .finally(() => {
        loading.value = false;
        inflight = null;
      });
    return inflight;
  }

  return {
    categories: cachedCategories,
    loading,
    error,
    loadCategories,
  };
}
