<script setup lang="ts">
interface NavItem {
  path: string;
  label: string;
}

defineProps<{
  active: string;
}>();

const navItems: NavItem[] = [
  { path: '/', label: '智能记账' },
  { path: '/transactions', label: '账单明细' },
  { path: '/stats', label: '消费统计' },
  { path: '/budget', label: '月度预算' },
];
</script>

<template>
  <header class="nav-bar">
    <nav class="nav-inner" aria-label="主导航">
      <span class="brand">AI 记账助手</span>
      <div class="links">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-link"
          :class="{ 'is-active': active === item.path }"
          :aria-current="active === item.path ? 'page' : undefined"
        >
          {{ item.label }}
        </RouterLink>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.nav-bar {
  background-color: var(--color-surface);
  border-bottom: var(--border-width) solid var(--color-border);
}

.nav-inner {
  max-width: var(--size-container);
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.brand {
  font-weight: 600;
  font-size: var(--text-base);
}

.links {
  display: flex;
  gap: var(--space-2);
}

.nav-link {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.nav-link.is-active {
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
}
</style>
