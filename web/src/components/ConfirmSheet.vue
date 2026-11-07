<script setup lang="ts">
import { nextTick, onMounted, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from './BaseButton.vue';
import FormAlert from './FormAlert.vue';

/**
 * Confirms a destructive or money action, spelling out the consequence (design-system principle 3).
 * A modal <dialog>: bottom sheet on phones, centred card on wider screens; Escape cancels.
 * Extra inputs (e.g. a new password) go in the default slot.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    body?: string;
    confirmLabel: string;
    tone?: 'primary' | 'danger';
    busy?: boolean;
    error?: string;
  }>(),
  { body: undefined, tone: 'danger', busy: false, error: undefined },
);
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const { t } = useI18n();
const id = useId();
const dialog = ref<HTMLDialogElement | null>(null);

const sync = async (open: boolean) => {
  await nextTick();
  const element = dialog.value;
  if (!element) return;
  if (open && !element.open) {
    // jsdom has no showModal; real browsers put the dialog in the top layer with a backdrop.
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
  } else if (!open && element.open) {
    if (typeof element.close === 'function') element.close();
    else element.removeAttribute('open');
  }
};

watch(() => props.open, sync);
onMounted(() => void sync(props.open));

const onCancel = (event: Event) => {
  event.preventDefault();
  if (!props.busy) emit('cancel');
};
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-sheet"
    :aria-labelledby="`${id}-title`"
    :aria-describedby="body ? `${id}-body` : undefined"
    @cancel="onCancel"
  >
    <form class="confirm-sheet__panel" method="dialog" novalidate @submit.prevent="emit('confirm')">
      <h2 :id="`${id}-title`" class="confirm-sheet__title">{{ title }}</h2>
      <p v-if="body" :id="`${id}-body`" class="confirm-sheet__body">{{ body }}</p>
      <slot />
      <FormAlert v-if="error" :message="error" />
      <div class="confirm-sheet__actions">
        <BaseButton variant="secondary" size="lg" :disabled="busy" @click="emit('cancel')">
          {{ t('sheet.cancel') }}
        </BaseButton>
        <BaseButton type="submit" :variant="tone" size="lg" :loading="busy">
          {{ confirmLabel }}
        </BaseButton>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.confirm-sheet {
  inline-size: 100%;
  max-inline-size: 100%;
  margin: auto auto 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-3) var(--radius-3) 0 0;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
}

.confirm-sheet::backdrop {
  background: rgb(0 0 0 / 45%);
}

.confirm-sheet__panel {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-3) var(--space-4);
}

.confirm-sheet__title {
  margin: 0;
  font-size: var(--font-size-lead);
}

.confirm-sheet__body {
  margin: 0;
  color: var(--color-text-muted);
}

.confirm-sheet__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-block-start: var(--space-2);
}

@media (width >= 600px) {
  .confirm-sheet {
    max-inline-size: 28rem;
    margin: auto;
    border-radius: var(--radius-3);
  }

  .confirm-sheet__panel {
    padding: var(--space-5) var(--space-4) var(--space-4);
  }
}
</style>
