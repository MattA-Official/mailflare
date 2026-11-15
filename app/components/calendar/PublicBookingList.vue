<script setup lang="ts">
// Public list of a host's bookable meetings, at /c/<username> and /book/<userId>.
// Ported from legacy/src/app/book/[userId]/page.tsx.
import type { PublicBookingEvent } from '~/types/calendar'

const props = defineProps<{ username?: string, userId?: string }>()
const { t } = useLanguage()

const query = computed(() => props.username ? { username: props.username } : { userId: props.userId ?? '' })

const { data, status, error: loadError } = useFetch<{ name: string, events: PublicBookingEvent[] }>('/api/public/booking', { query })
const name = computed(() => data.value?.name ?? '')
const events = computed(() => data.value?.events ?? [])
const loading = computed(() => status.value === 'pending')
const error = computed(() => loadError.value ? t('public.listUnavailable') : '')

useHead({ title: () => name.value ? t('public.bookMeetingWith', { name: name.value }) : t('public.bookMeeting') })
</script>

<template>
  <main class="flex min-h-dvh flex-col bg-muted p-4 lg:pt-12">
    <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <div class="mb-7">
        <h1 class="text-2xl font-semibold text-highlighted md:text-3xl">
          {{ name ? t('public.bookMeetingWith', { name }) : t('public.bookMeeting') }}
        </h1>
        <p class="mt-2 text-sm text-muted">
          {{ t('public.chooseMeeting') }}
        </p>
      </div>
      <div v-if="loading" role="status" :aria-label="t('public.loadingMeetings')" class="space-y-3">
        <span class="sr-only">{{ t('public.loadingMeetingsEllipsis') }}</span>
        <UCard v-for="item in 3" :key="item">
          <USkeleton class="h-5 w-2/3" />
          <USkeleton class="mt-4 h-3 w-5/6" />
          <USkeleton class="mt-3 h-3 w-1/3" />
        </UCard>
      </div>
      <UAlert v-else-if="error" role="alert" color="error" variant="subtle" :title="error" />
      <UEmpty v-else-if="events.length === 0" variant="outline" icon="i-lucide-calendar-x" :description="t('public.noMeetings')" />
      <div v-else class="space-y-3">
        <NuxtLink
          v-for="event in events"
          :key="event.id"
          :to="username ? `/c/${username}/${event.slug}` : `/book/${userId}/${event.id}`"
          class="group flex items-center gap-4 rounded-lg bg-default p-5 ring ring-default transition-colors hover:bg-elevated/50"
        >
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold text-highlighted group-hover:text-primary">{{ event.name }}</h2>
            <p v-if="event.description" class="mt-1 line-clamp-2 text-sm whitespace-pre-wrap text-toned">{{ event.description }}</p>
            <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span class="inline-flex items-center gap-1"><UIcon name="i-lucide-clock-3" class="size-4" />{{ t('public.minutesLong', { count: event.durationMinutes }) }}</span>
              <span v-if="event.location" class="inline-flex items-center gap-1"><UIcon name="i-lucide-map-pin" class="size-4" />{{ event.location }}</span>
            </p>
          </div>
          <UIcon name="i-lucide-arrow-right" class="size-5 text-dimmed group-hover:text-primary" />
        </NuxtLink>
      </div>
      <CalendarPublicFooter class="mt-auto pt-10" />
    </div>
  </main>
</template>
