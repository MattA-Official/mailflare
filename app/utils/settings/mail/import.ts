// Import sources, IMAP discovery and background import jobs.
// Ported from legacy/src/app/(settings)/settings/import/utils.ts, components/settings/import-jobs-utils.ts
// and import-messages-utils.ts.
import type { ImportJobSummary } from '#lib/import/jobs-types'
import type { ImapFormState, ImportSourceItem, ImportSourceOption, ImportSourceSection } from '~/types/settings/mail'
import { fetchMailboxFolders } from './inbox-rules'

/** Other areas cache folder lists and listen for this. */
export const FOLDERS_CHANGED_EVENT = 'mailflare:folders-changed'
export const MESSAGES_CHANGED_EVENT = 'mailflare:messages-changed'
export const IMPORT_JOBS_POLL_MS = 2000

export const importSourceOptions: ImportSourceOption[] = [
  { value: 'inbox', label: 'Inbox', imapFolder: 'INBOX', destination: 'system:inbox', system: true },
  { value: 'sent', label: 'Sent', imapFolder: 'Sent', destination: 'system:sent', system: true },
  { value: 'drafts', label: 'Drafts', imapFolder: 'Drafts', destination: 'system:drafts', system: true },
  { value: 'archived', label: 'Archived', imapFolder: 'Archive', destination: 'system:archived', system: true },
  { value: 'spam', label: 'Spam', imapFolder: 'Spam', destination: 'system:spam', system: true },
  { value: 'trash', label: 'Trash', imapFolder: 'Trash', destination: 'system:trash', system: true },
  { value: 'others', label: 'Others', imapFolder: '', destination: 'system:inbox' },
]

export function getImportSourceOption(section: ImportSourceSection): ImportSourceOption {
  return importSourceOptions.find(option => option.value === section) ?? importSourceOptions[0]!
}

export function getSelectedImportSources(sections: ImportSourceSection[]): ImportSourceItem[] {
  return sections.map((section) => {
    const option = getImportSourceOption(section)
    return {
      id: `system:${option.value}`,
      label: option.label,
      imapFolder: option.imapFolder,
      destination: option.destination,
      sourceSection: option.value,
    }
  })
}

export function getFolderImportSource(folderName: string): ImportSourceItem {
  return { id: `folder:${folderName}`, label: folderName, imapFolder: folderName, destination: '', folderName }
}

export function resolveImapSourceFolder(source: ImportSourceItem, folders: string[]): string {
  if (!source.sourceSection || source.sourceSection === 'others') return source.imapFolder
  return findFolderMatch(folders, getFolderAliases(source.sourceSection)) ?? source.imapFolder
}

export function filterCustomImapFolders(folders: string[], selectedSources: ImportSourceItem[]): string[] {
  const systemAliases = new Set(
    (['inbox', 'sent', 'drafts', 'archived', 'spam', 'trash'] as ImportSourceSection[])
      .flatMap(getFolderAliases)
      .map(normalizeFolderName),
  )
  for (const source of selectedSources) {
    const folder = resolveImapSourceFolder(source, folders)
    if (folder) systemAliases.add(normalizeFolderName(folder))
  }
  return folders.filter(folder => !systemAliases.has(normalizeFolderName(folder)))
}

export function getFileImportSource(sources: ImportSourceItem[]): ImportSourceItem {
  return sources.find(source => source.id !== 'system:others') ?? getSelectedImportSources(['inbox'])[0]!
}

/** Finds a mailbox folder by name, case-insensitively, creating it when missing. Returns its id. */
export async function ensureMailboxFolder(mailboxId: string, name: string): Promise<string> {
  const find = async () => (await fetchMailboxFolders(mailboxId)).find(folder => folder.name.toLowerCase() === name.toLowerCase())?.id
  const existing = await find()
  if (existing) return existing
  const response = await authFetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailboxId, name }),
  })
  const data = (await response.json().catch(() => ({}))) as { id?: string, error?: unknown }
  window.dispatchEvent(new Event(FOLDERS_CHANGED_EVENT))
  if (response.ok && data.id) return data.id
  // Another batch may have created it in the meantime.
  const created = response.status === 409 ? await find() : undefined
  if (created) return created
  throw new Error(typeof data.error === 'string' ? data.error : `Unable to create folder ${name}`)
}

export async function ensureImportDestination(mailboxId: string, source: ImportSourceItem): Promise<string> {
  if (!source.folderName) return source.destination
  return `folder:${await ensureMailboxFolder(mailboxId, source.folderName)}`
}

async function readImportJson<T extends object>(response: Response): Promise<T> {
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    const status = response.status === 503 ? 'the Worker exceeded its resource limits' : `HTTP ${response.status}`
    throw new Error(`Import request failed (${status}). Try again with a smaller batch size.`)
  }
}

function imapCredentials(form: ImapFormState) {
  return { host: form.host, port: Number(form.port), secure: form.secure, username: form.username, password: form.password }
}

export async function fetchImapFolders(form: ImapFormState): Promise<string[]> {
  const response = await authFetch('/api/import/imap/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(imapCredentials(form)),
  })
  const data = await readImportJson<{ folders?: string[], error?: string }>(response)
  if (!response.ok) throw new Error(data.error ?? 'Unable to list IMAP folders')
  return data.folders ?? []
}

export async function startImapImport(
  mailboxId: string,
  form: ImapFormState,
  sources: { folder: string, destination: string }[],
): Promise<ImportJobSummary> {
  const response = await authFetch('/api/import/imap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailboxId, sources, ...imapCredentials(form), limit: Number(form.limit), importAll: form.importAll }),
  })
  const data = await readImportJson<{ job?: ImportJobSummary, error?: string }>(response)
  if (!response.ok || !data.job) throw new Error(data.error ?? 'IMAP import failed')
  return data.job
}

export async function fetchImportJobs(): Promise<ImportJobSummary[]> {
  const response = await authFetch('/api/import/jobs')
  if (!response.ok) throw new Error('Unable to load imports')
  return (await readImportJson<{ jobs?: ImportJobSummary[] }>(response)).jobs ?? []
}

/** Cancels a running import, or removes a finished one from the list. */
export async function removeImportJob(id: string): Promise<void> {
  const response = await authFetch(`/api/import/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Unable to update the import')
}

/** Continues a failed import. IMAP imports need the password again, since it is never stored. */
export async function resumeImportJob(id: string, password?: string): Promise<void> {
  const response = await authFetch(`/api/import/jobs/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || 'Unable to resume the import')
  }
}

export function isImportJobActive(job: Pick<ImportJobSummary, 'status'>): boolean {
  return job.status === 'queued' || job.status === 'running'
}

/** Whole percent, or null while the job does not know its size yet. */
export function getImportJobPercent(job: Pick<ImportJobSummary, 'status' | 'total' | 'processed'>): number | null {
  if (job.status === 'completed') return 100
  if (job.total <= 0) return null
  return Math.min(100, Math.floor((job.processed / job.total) * 100))
}

/** Uploads .eml/.mbox files as a background import job. XHR, because fetch has no upload progress. */
export function importMessageFiles(
  mailboxId: string,
  files: File[],
  destination: string,
  onProgress?: (percentage: number) => void,
): Promise<{ job?: ImportJobSummary, error?: string }> {
  const form = new FormData()
  form.set('mailboxId', mailboxId)
  form.set('destination', destination)
  form.set('background', '1')
  for (const file of files) form.append('files', file)

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/import/messages')
    getAuthHeaders().forEach((value, key) => request.setRequestHeader(key, value))
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
    }
    request.onerror = () => reject(new Error('Import upload failed'))
    request.onload = () => {
      let data: { job?: ImportJobSummary, error?: string }
      try {
        data = JSON.parse(request.responseText || '{}')
      } catch {
        data = { error: `HTTP ${request.status}` }
      }
      if (request.status < 200 || request.status >= 300) reject(new Error(data.error ?? 'Import failed'))
      else resolve(data)
    }
    request.send(form)
  })
}

function findFolderMatch(folders: string[], aliases: string[]): string | null {
  const normalizedAliases = aliases.map(normalizeFolderName)
  return folders.find(folder => normalizedAliases.includes(normalizeFolderName(folder))) ?? null
}

function getFolderAliases(section: ImportSourceSection): string[] {
  if (section === 'inbox') return ['INBOX', 'Inbox']
  if (section === 'sent') return ['Sent', 'Sent Mail', '[Gmail]/Sent Mail', 'Sent Items', 'Sent Messages']
  if (section === 'drafts') return ['Drafts', '[Gmail]/Drafts']
  if (section === 'archived') return ['Archive', 'Archived', '[Gmail]/All Mail']
  if (section === 'spam') return ['Spam', 'Junk', 'Junk Email', '[Gmail]/Spam']
  if (section === 'trash') return ['Trash', 'Deleted', 'Deleted Items', 'Deleted Messages', '[Gmail]/Trash', '[Gmail]/Bin']
  return []
}

function normalizeFolderName(value: string): string {
  return value.toLowerCase().replace(/^\[gmail\]\//, '').replace(/\s+/g, ' ').trim()
}
