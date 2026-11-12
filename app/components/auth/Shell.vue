<script setup lang="ts">
// Two-panel frame shared by sign-in, setup, onboarding and password reset pages.
// Ported from legacy/src/components/auth/auth-shell.tsx. Pages using it set `layout: false`.
import type { AuthShellStep } from '~/types/auth/flows'
import { DEFAULT_BRANDING, loadAuthBranding } from '~/utils/auth/branding'

const props = defineProps<{
  icon: string
  title: string
  description?: string
  steps?: AuthShellStep[]
}>()

const branding = ref(DEFAULT_BRANDING)
const iconUrl = ref('/icon-96.png')
const iconFailed = ref(false)

onMounted(async () => {
  branding.value = await loadAuthBranding()
  if (branding.value.hasCustomIcon) iconUrl.value = '/api/branding/icon'
})

function onIconError() {
  if (iconUrl.value !== '/icon-96.png') iconUrl.value = '/icon-96.png'
  else iconFailed.value = true
}

useHead({ title: () => props.title })
</script>

<template>
  <div class="min-h-dvh bg-muted text-default sm:p-6 lg:flex lg:items-center lg:p-10">
    <main class="mx-auto grid min-h-dvh w-full max-w-4xl grid-rows-[auto_1fr] overflow-hidden bg-default sm:min-h-0 sm:grid-rows-none sm:rounded-3xl sm:ring sm:ring-default lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <section class="flex flex-col p-7 sm:p-10 lg:p-14">
        <div class="flex items-center gap-2">
          <UIcon v-if="iconFailed" :name="icon" class="size-8 text-primary" />
          <img v-else :src="iconUrl" alt="" class="size-8 object-contain" @error="onIconError">
          <span class="truncate font-semibold text-highlighted">{{ branding.appName }}</span>
        </div>

        <div class="mt-10 sm:mt-6 lg:mt-8">
          <h1 class="max-w-md text-3xl font-medium leading-tight tracking-tight text-highlighted sm:text-4xl">
            {{ title }}
          </h1>
          <div v-if="description || $slots.description" class="mt-5 max-w-md text-base leading-7 text-muted">
            <slot name="description">{{ description }}</slot>
          </div>
        </div>

        <div class="mt-auto hidden pt-8 lg:block">
          <AppLanguageSelect />
        </div>
      </section>

      <section class="flex min-w-0 flex-col justify-start px-7 pt-0 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:justify-center sm:p-10 lg:p-14">
        <ol v-if="steps" class="mb-7 flex flex-wrap gap-2 text-xs font-semibold" :aria-label="title">
          <li v-for="(step, index) in steps" :key="step.label" class="flex items-center gap-2">
            <span :class="step.active ? 'text-primary' : 'text-muted'" :aria-current="step.active ? 'step' : undefined">
              {{ index + 1 }} {{ step.label }}
            </span>
            <span v-if="index < steps.length - 1" class="text-dimmed">/</span>
          </li>
        </ol>
        <div class="w-full">
          <slot />
        </div>
        <div v-if="$slots.footer" class="mt-8 text-sm font-medium">
          <slot name="footer" />
        </div>
        <div class="mt-auto pt-8 lg:hidden">
          <AppLanguageSelect />
        </div>
      </section>
    </main>
  </div>
</template>
