<script setup lang="ts">
import BrandMark from '@/components/BrandMark.vue';
</script>

<template>
  <div class="auth-layout">
    <header class="auth-layout__header">
      <RouterLink to="/" class="auth-layout__brand"><BrandMark /></RouterLink>
    </header>
    <main class="auth-layout__main">
      <div class="auth-layout__card">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-layout {
  min-block-size: 100dvh;
  background: var(--color-bg);
}

.auth-layout__header {
  padding: var(--space-3) var(--space-4);
}

.auth-layout__brand {
  text-decoration: none;
}

.auth-layout__main {
  display: grid;
  place-items: start center;
  padding: var(--space-3);
}

.auth-layout__card {
  inline-size: 100%;
  max-inline-size: var(--measure-form);
  padding: var(--space-5) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}
</style>
