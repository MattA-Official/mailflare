<script setup lang="ts">
// Centred card for login, registration, setup and password reset.
</script>

<template>
  <div class="min-h-dvh flex flex-col items-center justify-center gap-6 bg-muted px-4 py-10">
    <NuxtLink to="/" class="flex items-center gap-2 text-lg font-semibold text-highlighted">
      <AppLogo class="size-7" />
      <span>Mailflare</span>
    </NuxtLink>
    <UCard class="w-full max-w-md">
      <slot />
    </UCard>
    <AppLanguageSelect />
  </div>
</template>
