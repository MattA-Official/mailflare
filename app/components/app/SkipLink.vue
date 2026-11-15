<script setup lang="ts">
// The first tab stop of the signed-in shell: jumps past the sidebar to the page. Ported from upstream's
// skip-to-content.tsx. Focusing the target directly works with client-side routing, where following the
// hash alone would not move focus.
const props = defineProps<{ target: string }>()
const { t } = useLanguage()

function skip() {
  document.getElementById(props.target)?.focus()
}
</script>

<template>
  <a
    :href="`#${target}`"
    class="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-default focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary focus:shadow-lg focus:ring-2 focus:ring-primary"
    @click.prevent="skip"
  >{{ t('a11y.skipToContent') }}</a>
</template>
