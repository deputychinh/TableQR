<script setup lang="ts">
import { useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { Volume2, VolumeX } from 'lucide-vue-next';
import { VOICE_RATES, VOICE_VOLUMES, type VoiceSettings } from '../voice/settings';

/**
 * Kitchen voice toggle (TQR-027, design-system "Voice toggle"): one big switch, and while it is on
 * the reading speed and volume as two rows of large choices. `toggle` fires from the cook's tap,
 * so the page can speak inside that gesture (iOS needs it).
 */
const props = defineProps<{ settings: VoiceSettings; supported: boolean }>();
const emit = defineEmits<{
  toggle: [];
  change: [settings: VoiceSettings];
}>();
const { t } = useI18n();
const id = useId();

const choose = <K extends 'rate' | 'volume'>(key: K, value: VoiceSettings[K]) => {
  emit('change', { ...props.settings, [key]: value });
};
</script>

<template>
  <section class="voice-bar" :aria-labelledby="`${id}-title`">
    <h2 :id="`${id}-title`" class="visually-hidden">{{ t('kitchen.voice.region') }}</h2>
    <button
      type="button"
      role="switch"
      class="voice-bar__switch"
      :class="{ 'voice-bar__switch--on': settings.enabled && supported }"
      :aria-checked="settings.enabled && supported"
      :aria-describedby="`${id}-hint`"
      :disabled="!supported"
      @click="emit('toggle')"
    >
      <Volume2 v-if="settings.enabled && supported" :size="28" aria-hidden="true" />
      <VolumeX v-else :size="28" aria-hidden="true" />
      <span class="voice-bar__label">{{ t('kitchen.voice.toggle') }}</span>
      <span class="voice-bar__state" aria-hidden="true">
        {{ settings.enabled && supported ? t('kitchen.voice.on') : t('kitchen.voice.off') }}
      </span>
    </button>
    <p :id="`${id}-hint`" class="voice-bar__hint">
      {{ supported ? t('kitchen.voice.hint') : t('kitchen.voice.unsupported') }}
    </p>
    <div v-if="settings.enabled && supported" class="voice-bar__levels">
      <fieldset class="voice-bar__choice">
        <legend class="voice-bar__legend">{{ t('kitchen.voice.rate.legend') }}</legend>
        <label
          v-for="rate in VOICE_RATES"
          :key="rate"
          class="voice-bar__option"
          :class="{ 'voice-bar__option--selected': settings.rate === rate }"
        >
          <input
            class="voice-bar__input"
            type="radio"
            :name="`${id}-rate`"
            :value="rate"
            :checked="settings.rate === rate"
            @change="choose('rate', rate)"
          />
          {{ t(`kitchen.voice.rate.${rate}`) }}
        </label>
      </fieldset>
      <fieldset class="voice-bar__choice">
        <legend class="voice-bar__legend">{{ t('kitchen.voice.volume.legend') }}</legend>
        <label
          v-for="volume in VOICE_VOLUMES"
          :key="volume"
          class="voice-bar__option"
          :class="{ 'voice-bar__option--selected': settings.volume === volume }"
        >
          <input
            class="voice-bar__input"
            type="radio"
            :name="`${id}-volume`"
            :value="volume"
            :checked="settings.volume === volume"
            @change="choose('volume', volume)"
          />
          {{ t(`kitchen.voice.volume.${volume}`) }}
        </label>
      </fieldset>
    </div>
  </section>
</template>

<style scoped>
.voice-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  align-items: center;
  font-size: var(--font-size-kitchen);
}

.voice-bar__switch {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  min-block-size: var(--target-large);
  padding-inline: var(--space-4);
  border: 2px solid var(--color-border-strong);
  border-radius: 999px;
  font: inherit;
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
}

.voice-bar__switch--on {
  border-color: var(--color-primary);
  color: var(--color-on-primary);
  background: var(--color-primary);
}

.voice-bar__switch:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.voice-bar__switch:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.voice-bar__state {
  padding: 0 var(--space-2);
  border-radius: 999px;
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  background: var(--color-surface-muted);
}

.voice-bar__hint {
  flex: 1 1 16rem;
  margin: 0;
  font-size: var(--font-size-body);
  color: var(--color-text-muted);
}

.voice-bar__levels {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  inline-size: 100%;
}

.voice-bar__choice {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  padding: 0;
  border: 0;
}

.voice-bar__legend {
  float: inline-start;
  margin-inline-end: var(--space-2);
  padding: 0;
  font-weight: var(--font-weight-medium);
}

.voice-bar__option {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  min-block-size: var(--target-large);
  padding-inline: var(--space-3);
  border: 2px solid var(--color-border-strong);
  border-radius: var(--radius-2);
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
}

.voice-bar__option--selected {
  border-color: var(--color-primary);
  font-weight: var(--font-weight-bold);
  background: var(--color-primary-soft);
}

.voice-bar__option:focus-within {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.voice-bar__input {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  margin: 0;
  accent-color: var(--color-primary);
}
</style>
