<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { X } from 'lucide-vue-next';

/**
 * A modal sheet: slides up from the bottom on phones, centred on wider screens. The parent
 * mounts it with `v-if`; Escape, the close button or the parent's own buttons emit `close`.
 * Built on <dialog> so the browser traps focus and restores it on close.
 */
withDefaults(defineProps<{ title: string; closeLabel: string; closable?: boolean }>(), {
  closable: true,
});
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const titleId = useId();

const focusFirstField = () => {
  const field = dialog.value?.querySelector<HTMLElement>(
    '.base-sheet__body input, .base-sheet__body select, .base-sheet__body textarea',
  );
  field?.focus();
};

onMounted(async () => {
  const element = dialog.value;
  if (!element) return;
  if (typeof element.showModal === 'function') element.showModal();
  else element.setAttribute('open', ''); // jsdom has no showModal
  await nextTick();
  focusFirstField();
});

onBeforeUnmount(() => {
  const element = dialog.value;
  if (element?.open && typeof element.close === 'function') element.close();
});

const onCancel = (event: Event) => {
  event.preventDefault();
  emit('close');
};
</script>

<template>
  <dialog ref="dialog" class="base-sheet" :aria-labelledby="titleId" @cancel="onCancel">
    <div class="base-sheet__panel">
      <header class="base-sheet__header">
        <h2 :id="titleId" class="base-sheet__title">{{ title }}</h2>
        <button
          v-if="closable"
          type="button"
          class="base-sheet__close"
          :aria-label="closeLabel"
          @click="emit('close')"
        >
          <X :size="22" aria-hidden="true" />
        </button>
      </header>
      <div class="base-sheet__body"><slot /></div>
    </div>
  </dialog>
</template>

<style scoped>
.base-sheet {
  inline-size: 100%;
  max-inline-size: 100%;
  max-block-size: 92dvh;
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

.base-sheet__panel {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-4);
}

.base-sheet__header {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

.base-sheet__title {
  margin: 0;
  font-size: var(--font-size-lead);
}

.base-sheet__close {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: var(--target-min);
  block-size: var(--target-min);
  border: 0;
  border-radius: 50%;
  color: var(--color-text-muted);
  background: var(--color-surface-muted);
  cursor: pointer;
}

@media (width >= 600px) {
  .base-sheet {
    max-inline-size: 34rem;
    margin: auto;
    border-radius: var(--radius-3);
  }

  .base-sheet__panel {
    padding: var(--space-4);
  }
}
</style>
