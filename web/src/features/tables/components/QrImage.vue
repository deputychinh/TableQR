<script setup lang="ts">
import { ref, watch } from 'vue';
import { qrSvgDataUrl } from '../qr';

/** A QR code image for `text`, rendered in the browser as SVG (crisp on screen and paper). */
const props = defineProps<{ text: string; alt: string }>();
const src = ref<string>();

watch(
  () => props.text,
  async (text) => {
    const url = await qrSvgDataUrl(text);
    if (text === props.text) src.value = url; // ignore a stale render after a quick change
  },
  { immediate: true },
);
</script>

<template>
  <img v-if="src" class="qr-image" :src="src" :alt="alt" />
  <span v-else class="qr-image qr-image--pending" role="img" :aria-label="alt" />
</template>

<style scoped>
.qr-image {
  display: block;
  inline-size: 100%;
  block-size: auto;
  aspect-ratio: 1;
}

.qr-image--pending {
  background: var(--color-surface-muted);
}
</style>
