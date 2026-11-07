<script setup lang="ts">
import BaseButton from './BaseButton.vue';
import BaseSheet from './BaseSheet.vue';
import FormAlert from './FormAlert.vue';

/** Confirms a destructive or money action, spelling out the consequence (design principle 3). */
withDefaults(
  defineProps<{
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    danger?: boolean;
    busy?: boolean;
    error?: string;
  }>(),
  { danger: false, busy: false, error: undefined },
);
defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <BaseSheet :title="title" :close-label="cancelLabel" :closable="false" @close="$emit('cancel')">
    <div class="confirm-sheet">
      <p class="confirm-sheet__message">{{ message }}</p>
      <FormAlert v-if="error" :message="error" />
      <div class="confirm-sheet__actions">
        <BaseButton variant="secondary" size="lg" :disabled="busy" @click="$emit('cancel')">
          {{ cancelLabel }}
        </BaseButton>
        <BaseButton
          :variant="danger ? 'danger' : 'primary'"
          size="lg"
          :loading="busy"
          @click="$emit('confirm')"
        >
          {{ confirmLabel }}
        </BaseButton>
      </div>
    </div>
  </BaseSheet>
</template>

<style scoped>
.confirm-sheet {
  display: grid;
  gap: var(--space-3);
}

.confirm-sheet__message {
  margin: 0;
}

.confirm-sheet__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}
</style>
