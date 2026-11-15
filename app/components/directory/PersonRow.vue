<script setup lang="ts">
// Fork-only. One person in a directory list: photo, name, and title and department. With `to` the row is a
// link; otherwise it is a button that emits `open` (the directory opens a slideover on wide screens).
import { NuxtLink } from '#components'
import { personSubtitle, type DirectoryPersonSummary } from '~/utils/directory/directory'

const props = defineProps<{ person: DirectoryPersonSummary, to?: string }>()
defineEmits<{ open: [] }>()
defineSlots<{ default?: () => unknown }>()
const subtitle = computed(() => personSubtitle(props.person) ?? props.person.email)
</script>

<template>
  <li>
    <component
      :is="to ? NuxtLink : 'button'"
      :to="to"
      :type="to ? undefined : 'button'"
      class="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-elevated/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      @click="to ? undefined : $emit('open')"
    >
      <UUser :name="person.name" :description="subtitle" size="lg" class="min-w-0 flex-1" :ui="{ name: 'truncate font-semibold text-highlighted', description: 'truncate' }">
        <template #avatar>
          <DirectoryPersonAvatar :person="person" />
        </template>
      </UUser>
      <slot />
      <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
    </component>
  </li>
</template>
