<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Store } from 'lucide-vue-next';
import EmptyState from '@/components/EmptyState.vue';

/** AC54: what a guest sees when the restaurant behind a QR code or menu is suspended. */
const { t } = useI18n();
</script>

<template>
  <EmptyState
    :heading-level="1"
    :title="t('guestTable.suspendedTitle')"
    :body="t('guestTable.suspendedBody')"
  >
    <template #icon><Store :size="32" /></template>
  </EmptyState>
</template>
