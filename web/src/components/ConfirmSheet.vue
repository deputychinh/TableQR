<script setup lang="ts">
import BaseButton from './BaseButton.vue';
import BaseSheet from './BaseSheet.vue';

/** Confirms a destructive or money action, spelling out the consequence (design-system rule 3). */
withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    busy?: boolean;
    variant?: 'danger' | 'primary';
  }>(),
  { busy: false, variant: 'danger' },
);
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <BaseSheet :open="open" :title="title" @close="!busy && emit('cancel')">
    <p class="confirm-sheet__message">{{ message }}</p>
    <template #actions>
      <BaseButton variant="secondary" :disabled="busy" @click="emit('cancel')">
        {{ cancelLabel }}
      </BaseButton>
      <BaseButton :variant="variant" :loading="busy" @click="emit('confirm')">
        {{ confirmLabel }}
      </BaseButton>
    </template>
  </BaseSheet>
</template>

<style scoped>
.confirm-sheet__message {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
