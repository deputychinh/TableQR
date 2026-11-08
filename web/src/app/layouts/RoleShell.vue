<script setup lang="ts">
import { computed } from 'vue';
import { useSessionStore } from '@/stores/session';
import OwnerShell from './OwnerShell.vue';
import StaffShell from './StaffShell.vue';

/**
 * The single place a staff page gets its shell (one shell per role): the owner always sees
 * `OwnerShell`, everyone else `StaffShell` titled with `title`, whichever page they are on.
 */
defineProps<{ title?: string }>();
const session = useSessionStore();
const isOwner = computed(() => session.me?.user.role === 'owner');
</script>

<template>
  <OwnerShell v-if="isOwner">
    <slot />
  </OwnerShell>
  <StaffShell v-else :title="title ?? ''">
    <slot />
  </StaffShell>
</template>
