// Google Takeout import: zips are read in the browser and messages uploaded in batches.
// Ported from legacy/src/components/settings/takeout-import-utils.ts.
import type { TakeoutBatchMessage, TakeoutImportSummary, TakeoutUploadResponse } from '#lib/import/gmail-takeout-types'
import { listZipEntries, openZipEntry } from '#lib/import/zip-utils'
import type { TakeoutSource, TakeoutSourceList } from '~/types/settings/mail'
import { ensureMailboxFolder } from './import'

const PROGRESS_STORAGE_PREFIX = 'mailflare:takeout-import:'

function isZipFile(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
}

/** Finds the .mbox files to import among picked Takeout zips and .mbox files. */
export async function getTakeoutSources(files: File[]): Promise<TakeoutSourceList> {
  const sources: TakeoutSource[] = []
  const withoutMbox: string[] = []
  for (const file of files) {
    const fileKey = `${file.name}:${file.size}:${file.lastModified}`
    if (!isZipFile(file)) {
      sources.push({ key: fileKey, label: file.name, size: file.size, open: async () => file.stream() as ReadableStream<Uint8Array> })
      continue
    }
    const entries = (await listZipEntries(file)).filter(entry => /\.mbox$/i.test(entry.name) && entry.size > 0)
    if (entries.length === 0) withoutMbox.push(file.name)
    for (const entry of entries) {
      sources.push({
        key: `${fileKey}:${entry.name}`,
        label: `${file.name} › ${entry.name.split('/').pop()}`,
        size: entry.size,
        open: () => openZipEntry(file, entry),
      })
    }
  }
  return { sources, withoutMbox }
}

export function createTakeoutUploader(mailboxId: string) {
  return async (destination: string, messages: TakeoutBatchMessage[], signal?: AbortSignal): Promise<TakeoutUploadResponse> => {
    const form = new FormData()
    form.set('mailboxId', mailboxId)
    form.set('destination', destination)
    form.set('flags', JSON.stringify(Object.fromEntries(messages.map(message => [message.filename, { read: message.read, starred: message.starred }]))))
    for (const message of messages) {
      form.append('files', new Blob([message.raw as BlobPart], { type: 'message/rfc822' }), message.filename)
    }
    const response = await authFetch('/api/import/messages', { method: 'POST', body: form, signal })
    const data = (await response.json().catch(() => ({ error: `HTTP ${response.status}` }))) as TakeoutUploadResponse['data']
    return { status: response.status, data }
  }
}

export function createTakeoutFolderResolver(mailboxId: string) {
  return (name: string) => ensureMailboxFolder(mailboxId, name)
}

function progressKey(mailboxId: string, source: TakeoutSource): string {
  return `${PROGRESS_STORAGE_PREFIX}${mailboxId}:${source.key}`
}

/** How many messages of this source an earlier, interrupted import already finished. */
export function getTakeoutProgress(mailboxId: string, source: TakeoutSource): number {
  try {
    const value = Number(localStorage.getItem(progressKey(mailboxId, source)))
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

export function saveTakeoutProgress(mailboxId: string, source: TakeoutSource, committed: number): void {
  try {
    localStorage.setItem(progressKey(mailboxId, source), String(committed))
  } catch {
    // Without storage an interrupted import starts again from the beginning; duplicates are skipped.
  }
}

export function clearTakeoutProgress(mailboxId: string, source: TakeoutSource): void {
  try {
    localStorage.removeItem(progressKey(mailboxId, source))
  } catch {
    // Nothing was stored.
  }
}

export function emptyTakeoutSummary(): TakeoutImportSummary {
  return { read: 0, imported: 0, skipped: 0, failed: 0, errors: [], tooLarge: 0, ignored: 0, committed: 0, destinations: {}, aborted: false }
}

export function addTakeoutSummaries(total: TakeoutImportSummary, next: TakeoutImportSummary): TakeoutImportSummary {
  const destinations = { ...total.destinations }
  for (const [key, count] of Object.entries(next.destinations)) destinations[key] = (destinations[key] ?? 0) + count
  return {
    read: total.read + next.read,
    imported: total.imported + next.imported,
    skipped: total.skipped + next.skipped,
    failed: total.failed + next.failed,
    errors: [...total.errors, ...next.errors].slice(0, 50),
    tooLarge: total.tooLarge + next.tooLarge,
    ignored: total.ignored + next.ignored,
    committed: next.committed,
    destinations,
    aborted: next.aborted,
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(0, bytes / 1024 ** 2).toFixed(bytes >= 10 * 1024 ** 2 ? 0 : 1)} MB`
}
