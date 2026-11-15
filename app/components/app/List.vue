<script setup lang="ts">
// Fork-only. The bordered list used by admin and settings list pages; rows are AppListItem.
</script>

<template>
  <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-default">
    <slot />
  </ul>
</template>
