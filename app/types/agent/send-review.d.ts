// Ported from legacy/src/components/agent/send-review-types.d.ts.
export type ReviewSnapshot = {
  from: string
  to: string
  cc: string | null
  bcc: string | null
  subject: string
  text: string | null
  html: string | null
  scheduledAt: string | null
  attachments: { id: string, filename: string, size: number }[]
}

export type AgentReviewResponse = { status: string, snapshot: ReviewSnapshot | null, stale: boolean, unfamiliarRecipients?: string[], error?: string }
