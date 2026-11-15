<script setup lang="ts">
// Fork-only. One row of an AppList: a UUser (icon avatar, name, description) with optional trailing
// content in the default slot. With `to`, the whole row is a link and ends in a chevron. The name and
// description slots take richer content, such as badges; a block of badges in the description wraps rather than truncating.
import { NuxtLink } from '#components'

defineProps<{
  to?: string
  icon?: string
  name?: string
  description?: string
}>()

const slots = defineSlots<{
  default?: () => unknown
  name?: () => unknown
  description?: () => unknown
}>()
</script>

<template>
  <li>
    <component :is="to ? NuxtLink : 'div'" :to="to" class="flex items-center gap-4 px-5 py-4" :class="to && 'hover:bg-elevated/50'">
      <UUser
        :name="name"
        :description="description"
        :avatar="icon ? { icon, color: 'primary' } : undefined"
        size="lg"
        class="min-w-0 flex-1"
        :ui="{ name: 'truncate font-semibold text-highlighted', description: 'truncate' }"
      >
        <template v-if="slots.name" #name>
          <slot name="name" />
        </template>
        <template v-if="slots.description" #description>
          <slot name="description" />
        </template>
      </UUser>
      <slot />
      <UIcon v-if="to" name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
    </component>
  </li>
</template>
