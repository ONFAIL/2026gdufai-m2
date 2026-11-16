<script setup lang="ts">
import { computed } from 'vue';
import type { BudgetLevel } from '../types/contract';

const props = defineProps<{
  level: BudgetLevel;
}>();

const labelMap: Record<BudgetLevel, string> = {
  normal: '正常',
  near: '接近上限',
  over: '已超支',
};

const label = computed(() => labelMap[props.level]);
</script>

<template>
  <span class="badge" :class="`level-${level}`">{{ label }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 600;
}

.level-normal {
  background-color: var(--color-success-bg);
  color: var(--color-success);
}

.level-near {
  background-color: var(--color-warning-bg);
  color: var(--color-warning);
}

.level-over {
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
}
</style>
