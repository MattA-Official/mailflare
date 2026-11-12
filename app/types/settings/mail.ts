// Types for the mail settings pages, ported from legacy/src/components/settings
// (inbox-rules-types, takeout-import-types) and app/(settings)/settings/import/types.
import type { TakeoutImportSummary } from '#lib/import/gmail-takeout-types'

export interface RuleFolder {
  id: string
  name: string
}

export type InboxRuleField = 'email' | 'content' | 'title'
export type InboxRuleOperator = 'contains' | 'exact'

export interface InboxRule {
  id: string
  pattern: string
  matchField: InboxRuleField
  matchOperator: InboxRuleOperator
  matchValue: string
  action: 'store' | 'forward' | 'reject' | 'spam' | 'trash'
  folderId: string | null
  forwardTo: string | null
  keepCopy: boolean
  priority: number
}

export interface InboxRuleInput {
  mailboxId: string
  matchField: InboxRuleField
  matchOperator: InboxRuleOperator
  matchValue: string
  destination: string
  forwardTo?: string
  keepCopy?: boolean
  priority: number
}

export interface ImapFormState {
  host: string
  port: string
  secure: boolean
  username: string
  password: string
  folder: string
  limit: string
  importAll: boolean
}

export type ImportSourceSection = 'inbox' | 'sent' | 'drafts' | 'archived' | 'spam' | 'trash' | 'others'

export interface ImportSourceOption {
  value: ImportSourceSection
  label: string
  imapFolder: string
  destination: string
  system?: boolean
}

export type ImportTab = 'file' | 'imap' | 'takeout'

export interface ImportSourceItem {
  id: string
  label: string
  imapFolder: string
  destination: string
  folderName?: string
  sourceSection?: ImportSourceSection
}

export interface ImportFolderSummary {
  id: string
  name: string
}

export interface ImportProgress {
  completed: number
  label: string
  total: number
}

/** One .mbox to import: a picked .mbox file, or an .mbox entry inside a picked Takeout zip. */
export interface TakeoutSource {
  /** Stable across page loads, used to continue an interrupted import. */
  key: string
  label: string
  /** Uncompressed size in bytes. */
  size: number
  open: () => Promise<ReadableStream<Uint8Array>>
}

export interface TakeoutSourceList {
  sources: TakeoutSource[]
  /** Picked zip files that contain no .mbox. */
  withoutMbox: string[]
}

export interface TakeoutRunState {
  mode: 'preview' | 'import'
  sourceIndex: number
  sourceCount: number
  sourceLabel: string
  bytesRead: number
  bytesTotal: number
  resumedAt: number
  summary: TakeoutImportSummary
}
