<script setup lang="ts">
import { computed } from 'vue';
import type { Direction } from '../types/contract';
import { formatCents } from '../utils/money';

const props = defineProps<{
  cents: number | null | undefined;
  direction?: Direction;
}>();

const formatted = computed(() => formatCents(props.cents));
</script>

<template>
  <span class="amount-text" :class="direction ? `is-${direction}` : ''">
    {{ formatted }}
  </span>
</template>

<style scoped>
.amount-text {
  font-family: var(--font-mono);
  font-weight: 600;
}

.is-income {
  color: var(--color-success);
}

.is-expense {
  color: var(--color-text);
}
</style>
