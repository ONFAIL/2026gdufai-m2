<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { importBatch } from '../api/index';
import { useCategories } from '../composables/useCategories';
import { feedbackText, type Direction, type ImportResultItem, type Modality } from '../types/contract';
import { nowIso, toDatetimeLocal } from '../utils/datetime';
import { yuanToCents, centsToYuanNumber } from '../utils/money';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';

const { categories, loading: catLoading, error: catError, loadCategories } = useCategories();
const rawText = ref('');
const amountInput = ref('');
const occurredAtInput = ref(toDatetimeLocal(nowIso()));
const direction = ref<Direction | null>(null);
const modality = ref<Modality>('text');
const sourceRef = ref<string | null>(null);
const currentKey = ref(`idem-${Date.now()}`);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const lastItem = ref<ImportResultItem | null>(null);

function handleFileSelect(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    sourceRef.value = file.name;
    modality.value = file.type.startsWith('audio/') ? 'voice' : 'image';
  }
}

async function submitRecord(): Promise<void> {
  submitting.value = true;
  submitError.value = null;
  const recordId = `rec-${Date.now()}`;
  const cents = yuanToCents(amountInput.value);
  const amountYuan = centsToYuanNumber(cents);
  try {
    const res = await importBatch({
      version: 1,
      batchId: `batch-${Date.now()}`,
      sentAt: nowIso(),
      records: [
        {
          recordId,
          userId: 'demo-user',
          direction: direction.value,
          amount: amountYuan,
          merchant: null,
          occurredAt: occurredAtInput.value || null,
          chatAt: nowIso(),
          rawText: rawText.value,
          modality: modality.value,
          sourceRef: sourceRef.value,
          confidence: 0.9,
          idempotencyKey: currentKey.value,
        },
      ],
    });
    for (const item of res.results) {
      if (item.recordId === recordId) {
        lastItem.value = item;
        if (item.status === 'confirmed' || item.status === 'duplicate' || item.status === 'rejected') {
          currentKey.value = `idem-${Date.now()}`;
        }
        break;
      }
    }
  } catch (err: unknown) {
    submitError.value = err instanceof Error ? err.message : '提交记账失败';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadCategories();
});
</script>

<template>
  <section class="page">
    <h1 class="title">智能记账（可用类别：{{ categories.length }}）</h1>
    <LoadingSkeleton v-if="catLoading" :rows="2" />
    <div v-else-if="catError" class="alert-error" role="alert">
      <span>{{ catError }}</span>
      <button type="button" class="btn" @click="loadCategories(true)">重试</button>
    </div>

    <form v-else class="card" @submit.prevent="submitRecord">
      <div class="field">
        <label for="cap-raw">消费或收入描述</label>
        <input id="cap-raw" v-model="rawText" type="text" placeholder="例如：午饭麻辣烫 24.5 元" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="cap-dir">收支方向（未指定将触发追问）</label>
          <select id="cap-dir" v-model="direction">
            <option :value="null">未指定（交由识别/追问）</option>
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
        </div>
        <div class="field">
          <label for="cap-amount">金额（元，留空可触发追问）</label>
          <input id="cap-amount" v-model="amountInput" type="text" inputmode="decimal" />
        </div>
        <div class="field">
          <label for="cap-time">发生时间</label>
          <input id="cap-time" v-model="occurredAtInput" type="datetime-local" />
        </div>
      </div>
      <div class="field">
        <label for="cap-file" class="file-label">附件小票或语音（可选）</label>
        <input id="cap-file" type="file" class="sr-only" @change="handleFileSelect" />
        <span class="hint">{{ sourceRef ?? '未选择文件，支持键盘 Tab 聚焦选择' }}</span>
      </div>
      <button type="submit" class="btn-primary" :disabled="submitting">
        {{ submitting ? '提交中...' : '提交记账' }}
      </button>
    </form>

    <div v-if="submitError" class="alert-error" role="alert">
      <span>{{ submitError }}</span>
      <button type="button" class="btn" @click="submitRecord">重试</button>
    </div>
    <div v-else-if="lastItem" class="card receipt" role="status">
      <p><strong>状态：</strong>{{ lastItem.status }}</p>
      <p v-if="lastItem.status === 'confirmed' || lastItem.status === 'duplicate'">
        已入账单号：{{ lastItem.transactionId ?? '—' }}（类别：{{ lastItem.category?.name ?? '—' }}）
      </p>
      <p v-for="(fb, idx) in lastItem.feedback" :key="idx">{{ feedbackText[fb.code] ?? fb.code }}</p>
    </div>
  </section>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-4); }
.title { margin: 0; font-size: var(--text-xl); }
.card { background: var(--color-surface); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.field-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); }
.field { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); }
.field input, .field select { padding: var(--space-2); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-sm); font-size: var(--text-sm); }
.file-label { color: var(--color-primary); cursor: pointer; text-decoration: underline; }
.hint { font-size: var(--text-xs); color: var(--color-text-muted); }
.btn-primary { align-self: flex-start; padding: var(--space-2) var(--space-4); border: 0; border-radius: var(--radius-md); background: var(--color-primary); color: var(--color-primary-contrast); cursor: pointer; }
.btn { padding: var(--space-1) var(--space-3); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); cursor: pointer; }
.alert-error { padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-danger-bg); color: var(--color-danger); display: flex; justify-content: space-between; align-items: center; }
</style>
