<script setup lang="ts">
import ShellFrame from './ShellFrame.vue';

/**
 * The owner's shell on every page they open, including the floor screens (Thu ngân, Bếp, Phục vụ):
 * restaurant name in the header, Tổng quan · Thực đơn · Bàn & QR · Đặt bàn · Thêm on phones and
 * the full rail (with "Vận hành") from 840 px. Pages pick it through `RoleShell`.
 */
</script>

<template>
  <ShellFrame>
    <slot />
  </ShellFrame>
</template>
