<script setup lang="ts">
withDefaults(
  defineProps<{
    rows?: number;
  }>(),
  {
    rows: 3,
  },
);
</script>

<template>
  <div class="skeleton-wrap" role="status" aria-label="正在加载数据">
    <div v-for="n in rows" :key="n" class="skeleton-row"></div>
  </div>
</template>

<style scoped>
.skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.skeleton-row {
  height: var(--size-skeleton-lg);
  border-radius: var(--radius-md);
  background-color: var(--color-surface-muted);
}
</style>
