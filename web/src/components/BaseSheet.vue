<script setup lang="ts">
import { onMounted, ref, useId, watch } from 'vue';

/**
 * Modal sheet on a native <dialog>: bottom sheet on phones, centred panel on iPad and wider.
 * The parent owns `open`; Esc and a tap on the backdrop ask it to close.
 */
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const titleId = useId();

const sync = (open: boolean) => {
  const element = dialog.value;
  if (!element) return;
  const isOpen = element.hasAttribute('open');
  if (open && !isOpen) {
    // jsdom and very old browsers lack showModal; the attribute still shows the content.
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
  } else if (!open && isOpen) {
    if (typeof element.close === 'function') element.close();
    else element.removeAttribute('open');
  }
};

watch(() => props.open, sync, { flush: 'post' });
onMounted(() => sync(props.open));

const onBackdrop = (event: MouseEvent) => {
  if (event.target === dialog.value) emit('close');
};
</script>

<template>
  <dialog
    ref="dialog"
    class="base-sheet"
    :aria-labelledby="titleId"
    @cancel.prevent="emit('close')"
    @click="onBackdrop"
  >
    <div v-if="open" class="base-sheet__panel">
      <h2 :id="titleId" class="base-sheet__title">{{ title }}</h2>
      <div class="base-sheet__body">
        <slot />
      </div>
      <div v-if="$slots.actions" class="base-sheet__actions">
        <slot name="actions" />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.base-sheet {
  overflow: hidden;
  inline-size: 100%;
  max-inline-size: 100%;
  max-block-size: calc(100dvh - var(--space-4));
  margin: auto auto 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-3) var(--radius-3) 0 0;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
}

.base-sheet::backdrop {
  background: rgb(0 0 0 / 45%);
}

/*
 * Title and actions stay put; only the form scrolls, so the buttons (e.g. "Xoá món") are always
 * on screen, even on a short phone (r2 review).
 */
.base-sheet__panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: var(--space-3);
  max-block-size: calc(100dvh - var(--space-4));
  padding: var(--space-4) var(--space-3) calc(var(--space-4) + env(safe-area-inset-bottom));
}

.base-sheet__title {
  margin: 0;
  font-size: var(--font-size-lead);
}

.base-sheet__body {
  overflow-y: auto;
  display: grid;
  gap: var(--space-3);
  align-content: start;

  /* Room for focus rings inside the scroll area. */
  margin: calc(-1 * var(--space-1));
  padding: var(--space-1);
}

.base-sheet__actions {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-2);
}

@media (width >= 600px) {
  .base-sheet {
    max-inline-size: 30rem;
    max-block-size: calc(100dvh - 2 * var(--space-5));
    margin: auto;
    border-radius: var(--radius-3);
  }

  .base-sheet__panel {
    max-block-size: calc(100dvh - 2 * var(--space-5));
    padding: var(--space-5);
  }

  .base-sheet__actions {
    flex-direction: row;
    justify-content: flex-end;
  }
}
</style>
