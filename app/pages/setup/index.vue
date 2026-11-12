<script setup lang="ts">
// First-run setup. Before any admin exists it registers the first account (system checks, primary
// domain, mailbox); afterwards it lets a signed-in admin without a domain add one and a first mailbox.
// Upstream decided this on the server (legacy/src/app/(auth)/setup/page.tsx); here the page middleware
// asks the same questions of /api/setup/status and /api/auth/me.
import { getSetupStatus } from '~/utils/auth/flows'
import type { SetupMode } from '~/types/auth/flows'

const mode = useState<SetupMode>('setup-mode', () => 'register')

definePageMeta({
  layout: false,
  auth: { mode: 'public' },
  middleware: [
    async () => {
      const setupMode = useState<SetupMode>('setup-mode')
      // An empty database has no tables yet, which the status endpoint reports as an error.
      const status = await getSetupStatus().catch(() => null)
      const info = await fetchSessionInfo({ fresh: true })
      const user = info?.status === 200 ? info.user : null
      if (!status?.hasAdminAccount) {
        if (user) return navigateTo('/inbox', { replace: true })
        setupMode.value = 'register'
        return
      }
      if (!user) return navigateTo('/login', { replace: true })
      if (user.role !== 'admin' || status.hasPrimaryDomain) return navigateTo('/inbox', { replace: true })
      setupMode.value = 'onboarding'
    },
  ],
})
</script>

<template>
  <AuthOnboardingFlow v-if="mode === 'onboarding'" />
  <AuthRegisterFlow v-else />
</template>
