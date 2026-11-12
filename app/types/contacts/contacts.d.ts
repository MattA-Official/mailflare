// Ported from legacy/src/components/contacts/contact-details-types.d.ts.
export type ContactDetailsRecord = {
  email: string
  displayName: string | null
  hasAvatar: boolean
  source: 'manual' | 'inbound' | 'outbound' | null
  blocked: boolean
  lastSeenAt: string | null
}

export type ContactDetailsResponse = {
  contact?: ContactDetailsRecord
  error?: string
}

/** Detail of the `mailflare:contact-changed` window event. */
export type ContactChangedDetail = { email: string, displayName: string }
