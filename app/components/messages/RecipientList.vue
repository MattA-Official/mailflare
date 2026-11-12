<script setup lang="ts">
// To, Cc or Bcc entries, each opening its contact card. Ported from recipient-list.tsx.
import { getEmailAddress } from '#lib/email/address'
import { formatRecipientAddress, recipientContactName, type RecipientAddressStyle } from '#lib/email/recipient-display'

defineProps<{ entries: string[], mailboxId: string | null, addressStyle: RecipientAddressStyle }>()
</script>

<template>
  <template v-if="entries.length === 0">—</template>
  <span v-for="(entry, index) in entries" v-else :key="`${entry}-${index}`" :title="getEmailAddress(entry)">
    <template v-if="index > 0">, </template>
    <ContactsContactDetailsTrigger
      :mailbox-id="mailboxId"
      :address="entry"
      :name="recipientContactName(entry)"
      :label="formatRecipientAddress(entry, addressStyle)"
    />
  </span>
</template>
