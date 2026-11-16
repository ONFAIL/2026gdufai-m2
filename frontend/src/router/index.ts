import { createRouter, createWebHistory } from 'vue-router';
import CaptureView from '../views/CaptureView.vue';
import TransactionsView from '../views/TransactionsView.vue';
import StatsView from '../views/StatsView.vue';
import BudgetView from '../views/BudgetView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'capture', component: CaptureView },
    { path: '/transactions', name: 'transactions', component: TransactionsView },
    { path: '/stats', name: 'stats', component: StatsView },
    { path: '/budget', name: 'budget', component: BudgetView },
  ],
});

export default router;
