<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppNav from './components/AppNav.vue';

const route = useRoute();
const activePath = computed(() => route.path);
</script>

<template>
  <div class="app-shell">
    <AppNav :active="activePath" />
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-main {
  max-width: var(--size-container);
  margin: 0 auto;
  padding: var(--space-5) var(--space-4);
}
</style>
