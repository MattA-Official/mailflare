<script setup lang="ts">
// Frame for every administration page; the standard page (AppPage) under its upstream name.
defineProps<{ id: string, title: string, description?: string, wide?: boolean }>()
</script>

<template>
  <AppPage :id="id" :title="title" :description="description" :wide="wide">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
    <template v-if="$slots.toolbar" #toolbar>
      <slot name="toolbar" />
    </template>
    <slot />
  </AppPage>
</template>
