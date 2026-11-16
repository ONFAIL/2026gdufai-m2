<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    hint?: string;
  }>(),
  {
    title: '暂无相关记录',
    hint: '当前条件下还没有可展示的账目数据',
  },
);
</script>

<template>
  <section class="empty-box" role="status">
    <p class="empty-title">{{ title }}</p>
    <p class="empty-hint">{{ hint }}</p>
  </section>
</template>

<style scoped>
.empty-box {
  padding: var(--space-8) var(--space-4);
  text-align: center;
  background-color: var(--color-surface);
  border: var(--border-width) dashed var(--color-border);
  border-radius: var(--radius-lg);
}

.empty-title {
  margin: 0 0 var(--space-2);
  font-weight: 600;
  font-size: var(--text-base);
  color: var(--color-text);
}

.empty-hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
</style>
