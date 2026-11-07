<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useHealth } from '../useHealth';

const props = defineProps<{ fetchImpl?: typeof fetch }>();
const { t } = useI18n();
const { state, check } = useHealth(props.fetchImpl ?? fetch);

onMounted(() => {
  void check();
});
</script>

<template>
  <section class="health-status" :aria-busy="state === 'loading'" aria-live="polite">
    <h2 class="health-status__title">{{ t('health.title') }}</h2>
    <p v-if="state === 'loading'" class="health-status__text">{{ t('health.loading') }}</p>
    <p v-else-if="state === 'ok'" class="health-status__text health-status__text--ok">
      {{ t('health.ok') }}
    </p>
    <template v-else>
      <p class="health-status__text health-status__text--error" role="alert">
        {{ t('health.error') }}
      </p>
      <button type="button" class="health-status__retry" @click="check">
        {{ t('health.retry') }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.health-status {
  padding: var(--space-4);
  border-radius: var(--radius-2);
  background: var(--color-surface);
}

.health-status__title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-body);
}

.health-status__text {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-2);
}

.health-status__text--ok {
  background: var(--color-success-bg);
}

.health-status__text--error {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.health-status__retry {
  min-height: var(--target-min);
  margin-top: var(--space-3);
  padding: 0 var(--space-4);
  border: 0;
  border-radius: var(--radius-2);
  font: inherit;
  color: var(--color-on-primary);
  background: var(--color-primary);
  cursor: pointer;
}
</style>
