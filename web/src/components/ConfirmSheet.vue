<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue';
import BaseButton from './BaseButton.vue';

/**
 * Confirms a money or destructive action with its consequence spelled out (design system §3).
 * A bottom sheet on phones, a centred dialog on wider screens; Escape or the backdrop cancels,
 * focus stays inside while open and returns to where it was on close.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    confirmLabel: string;
    cancelLabel: string;
    variant?: 'primary' | 'danger';
    busy?: boolean;
  }>(),
  { variant: 'primary', busy: false },
);
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const id = useId();
const panel = ref<HTMLElement | null>(null);
let returnFocus: HTMLElement | null = null;

const focusables = (): HTMLElement[] =>
  Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      focusables()[0]?.focus();
    } else {
      returnFocus?.focus();
      returnFocus = null;
    }
  },
);

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (!props.busy) emit('cancel');
    return;
  }
  if (event.key !== 'Tab') return;
  const items = focusables();
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="confirm-sheet" @keydown="onKey">
      <div class="confirm-sheet__backdrop" aria-hidden="true" @click="!busy && emit('cancel')" />
      <div
        ref="panel"
        class="confirm-sheet__panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${id}-title`"
        :aria-describedby="`${id}-body`"
      >
        <h2 :id="`${id}-title`" class="confirm-sheet__title">{{ title }}</h2>
        <div :id="`${id}-body`" class="confirm-sheet__body"><slot /></div>
        <div class="confirm-sheet__actions">
          <BaseButton variant="secondary" size="lg" :disabled="busy" @click="emit('cancel')">
            {{ cancelLabel }}
          </BaseButton>
          <BaseButton :variant="variant" size="lg" :loading="busy" @click="emit('confirm')">
            {{ confirmLabel }}
          </BaseButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-sheet {
  position: fixed;
  inset: 0;
  z-index: var(--z-toast);
  display: grid;
  align-items: end;
}

.confirm-sheet__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 45%);
}

.confirm-sheet__panel {
  position: relative;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-3) calc(var(--space-4) + env(safe-area-inset-bottom));
  border-radius: var(--radius-3) var(--radius-3) 0 0;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
}

.confirm-sheet__title {
  margin: 0;
  font-size: var(--font-size-lead);
}

.confirm-sheet__body {
  color: var(--color-text-muted);
}

.confirm-sheet__actions {
  display: grid;
  gap: var(--space-2);
}

@media (width >= 600px) {
  .confirm-sheet {
    place-items: center;
  }

  .confirm-sheet__panel {
    inline-size: min(28rem, 100% - 2 * var(--space-3));
    padding: var(--space-4);
    border-radius: var(--radius-3);
  }

  .confirm-sheet__actions {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
