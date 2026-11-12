<script setup lang="ts">
// Chooses which inbox the account page edits. Ported from legacy/src/components/settings/inbox-switcher.tsx.
import { getMailboxAddress } from '~/utils/settings/account/mailbox'

const { t } = useLanguage()
const { selectedMailbox, setSelectedMailbox, mailboxes } = useSelectedMailbox()
const open = ref(false)
</script>

<template>
  <UPopover v-if="selectedMailbox" v-model:open="open" :content="{ align: 'start', sideOffset: 8 }" :ui="{ content: 'w-(--reka-popover-trigger-width) p-1 max-h-72 overflow-y-auto' }">
    <button
      type="button"
      :aria-label="t('settings.account.switchInbox')"
      class="flex w-full items-center gap-3 rounded-lg border border-default px-4 py-3 text-start transition-colors hover:bg-elevated/50"
    >
      <SettingsAccountMailboxAvatar :mailbox="selectedMailbox" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <p class="truncate text-sm font-semibold text-highlighted">
            {{ selectedMailbox.displayName ?? selectedMailbox.localPart }}
          </p>
          <UIcon v-if="selectedMailbox.type === 'shared'" name="i-lucide-users-round" class="size-3.5 shrink-0 text-primary" :aria-label="t('account.sharedInbox')" />
        </div>
        <p class="truncate text-xs text-muted">
          {{ getMailboxAddress(selectedMailbox) }}
        </p>
      </div>
      <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-muted transition-transform" :class="{ 'rotate-180': open }" />
    </button>

    <template #content>
      <div role="listbox" :aria-label="t('settings.account.switchInbox')">
        <button
          v-for="mailbox in mailboxes"
          :key="mailbox.id"
          type="button"
          role="option"
          :aria-selected="mailbox.id === selectedMailbox.id"
          class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start hover:bg-elevated"
          @click="setSelectedMailbox(mailbox); open = false"
        >
          <SettingsAccountMailboxAvatar :mailbox="mailbox" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <p class="truncate text-sm font-semibold text-highlighted">
                {{ mailbox.displayName ?? mailbox.localPart }}
              </p>
              <UIcon v-if="mailbox.type === 'shared'" name="i-lucide-users-round" class="size-3.5 shrink-0 text-primary" :aria-label="t('account.sharedInbox')" />
            </div>
            <p class="truncate text-xs text-muted">
              {{ getMailboxAddress(mailbox) }}
            </p>
          </div>
          <UIcon v-if="mailbox.id === selectedMailbox.id" name="i-lucide-check" class="size-4 shrink-0 text-primary" />
        </button>
      </div>
    </template>
  </UPopover>
</template>
