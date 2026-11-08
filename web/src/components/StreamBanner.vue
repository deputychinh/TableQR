<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { WifiOff } from 'lucide-vue-next';
import type { StreamStatus } from '@/composables/useStream';

/**
 * The one "live connection lost" banner (TQR-031) on every screen that follows a stream: shown while
 * `useStream` is reconnecting (an error, a `bye`, or a stream silent for 2.5 heartbeats), gone once
 * the next snapshot arrives. Icon + words + colour, never colour alone.
 */
defineProps<{ status: StreamStatus }>();
const { t } = useI18n();
</script>

<template>
  <p v-if="status === 'reconnecting'" class="stream-banner" role="status">
    <WifiOff :size="24" aria-hidden="true" />
    <span>{{ t('stream.lost') }}</span>
  </p>
</template>

<style scoped>
.stream-banner {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  padding: var(--space-3);
  border: 2px solid var(--color-warning);
  border-radius: var(--radius-2);
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
  background: var(--color-warning-bg);
}
</style>
