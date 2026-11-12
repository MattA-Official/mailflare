<script setup lang="ts">
// Where the layout mounts the assistant: a column beside the page's panels that slides open, or
// takes the whole width when full size. Ported from the assistant <aside> in upstream's
// (dashboard) and (calendar) layouts.
const { enabled, visible, fullSize, close } = useAssistant()
</script>

<template>
  <aside
    class="min-h-0 min-w-0 shrink-0 overflow-hidden border-default transition-[width] duration-300 ease-in-out motion-reduce:transition-none"
    :class="[visible ? 'border-l' : 'opacity-0', fullSize && visible ? 'max-lg:fixed max-lg:inset-0 max-lg:z-50' : 'max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-50']"
    :style="{ width: visible ? (fullSize ? '100%' : 'min(390px, 100%)') : '0px' }"
    :aria-hidden="!visible"
    :inert="!visible"
  >
    <AgentPanel v-if="enabled" :open="visible" :full-size="fullSize" @toggle-full-size="fullSize = !fullSize" @close="close()" />
  </aside>
</template>
