<script setup lang="ts">
// The mail search box for a list panel's navbar (upstream mail-search-input + header-search). On phones
// it is an icon until tapped, then covers the navbar. "/" focuses it through data-mail-search-input.
const { t } = useLanguage()
const { input } = useMailSearch()
const { shortcutsActive, openCommandPalette } = useShortcuts()
const expanded = ref(false)
const field = useTemplateRef<{ inputRef?: HTMLInputElement }>('field')

async function expand() {
  expanded.value = true
  await nextTick()
  field.value?.inputRef?.focus()
}
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center max-lg:justify-end">
    <UButton
      icon="i-lucide-search"
      color="neutral"
      :variant="input ? 'soft' : 'ghost'"
      class="lg:hidden"
      :class="expanded && 'hidden'"
      :aria-label="t('search.mail')"
      @click="expand"
    />
    <form
      role="search"
      class="min-w-0 flex-1 lg:block"
      :class="expanded ? 'max-lg:absolute max-lg:inset-x-2 max-lg:top-1/2 max-lg:z-10 max-lg:-translate-y-1/2' : 'max-lg:hidden'"
      @submit.prevent
    >
      <UInput
        ref="field"
        v-model="input"
        icon="i-lucide-search"
        variant="soft"
        size="lg"
        class="w-full max-w-2xl lg:min-w-96"
        :ui="{ base: 'rounded-full' }"
        data-mail-search-input
        :aria-label="t('search.mail')"
        :placeholder="shortcutsActive ? t('search.mailHint') : t('search.mail')"
        @blur="expanded = false"
      >
        <template #trailing>
          <UButton
            v-if="input"
            icon="i-lucide-x"
            color="neutral"
            variant="link"
            size="sm"
            :aria-label="t('search.clear')"
            @mousedown.prevent
            @click="input = ''"
          />
          <UButton v-else-if="shortcutsActive" color="neutral" variant="link" size="sm" class="max-sm:hidden" :title="t('search.openPalette')" @click="openCommandPalette">
            <UKbd value="meta" /><UKbd value="K" />
          </UButton>
        </template>
      </UInput>
    </form>
  </div>
</template>
