<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getBudgets } from '../api/index';
import type { BudgetItem } from '../types/contract';
import { DEMO_TODAY } from '../mock/data';
import AmountText from '../components/AmountText.vue';
import EmptyState from '../components/EmptyState.vue';
import LevelBadge from '../components/LevelBadge.vue';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';

const month = ref(DEMO_TODAY.slice(0, 7));
const budgets = ref<BudgetItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function loadBudgets(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    budgets.value = await getBudgets(month.value);
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '加载预算数据失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadBudgets();
});
</script>

<template>
  <section class="page">
    <div class="toolbar">
      <h1 class="title">月度预算</h1>
      <div class="filter">
        <label for="budget-month-input">选择月份</label>
        <input id="budget-month-input" v-model="month" type="month" @change="loadBudgets" />
      </div>
    </div>

    <LoadingSkeleton v-if="loading" :rows="3" />
    <div v-else-if="error" class="alert-error" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="btn" @click="loadBudgets">重试</button>
    </div>
    <EmptyState v-else-if="budgets.length === 0" title="该月份暂未设置预算" hint="请切换其他月份查看预算执行情况" />
    <div v-else class="grid">
      <article v-for="(b, idx) in budgets" :key="b.category ? b.category.id : `total-${idx}`" class="card">
        <div class="card-head">
          <strong>{{ b.scope === 'total' ? '月度总预算' : (b.category?.name ?? '—') }}</strong>
          <LevelBadge :level="b.level" />
        </div>
        <div class="card-nums">
          <span>已用：<AmountText :cents="b.spentCents" /></span>
          <span>限额：<AmountText :cents="b.amountCents" /></span>
          <span>剩余：<AmountText :cents="b.remainingCents" /></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${Math.min(100, Math.round(b.usageRatio * 100))}%` }"></div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-4); }
.toolbar { display: flex; justify-content: space-between; align-items: center; }
.title { margin: 0; font-size: var(--text-xl); }
.filter { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
.filter input { padding: var(--space-1) var(--space-2); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-sm); }
.grid { display: flex; flex-direction: column; gap: var(--space-3); }
.card { background: var(--color-surface); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.card-nums { display: flex; flex-wrap: wrap; gap: var(--space-4); font-size: var(--text-sm); }
.progress-track { height: var(--size-progress-height); background: var(--color-surface-muted); border-radius: var(--radius-pill); overflow: hidden; }
.progress-fill { height: 100%; background: var(--color-primary); }
.btn { padding: var(--space-1) var(--space-3); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); cursor: pointer; }
.alert-error { padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-danger-bg); color: var(--color-danger); display: flex; justify-content: space-between; align-items: center; }
</style>
