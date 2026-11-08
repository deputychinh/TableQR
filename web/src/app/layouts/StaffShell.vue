<script setup lang="ts">
import ShellFrame from './ShellFrame.vue';

/**
 * The shell of cashier, waiter, kitchen and platform-admin: the screen's title and the restaurant
 * in the header, and the role's own navigation (waiter: Phục vụ · Duyệt đơn · Bàn & QR · Đặt bàn;
 * cashier: Thu ngân · Bàn & QR · Đặt bàn; kitchen and platform admin: none). Pages pick it
 * through `RoleShell`.
 */
defineProps<{ title: string }>();
</script>

<template>
  <ShellFrame :title="title">
    <slot />
  </ShellFrame>
</template>
