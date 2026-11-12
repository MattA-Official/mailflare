// Ported from legacy/src/app/(admin)/domains/types.d.ts. The fork is Cloudflare only, so the only
// providers are Cloudflare and none; the database columns keep upstream's wider set.
export type SendingProvider = 'none' | 'cloudflare'
export type ReceivingProvider = 'none' | 'cloudflare'

export interface Domain {
  id: string
  hostname: string
  status: string
  routingEnabled: boolean
  sendingEnabled: boolean
  sendingRequested: boolean
  sendingProvider: SendingProvider | string
  receivingProvider: ReceivingProvider | string
  zoneId: string
  /** Added with DNS skipped: the Cloudflare zone is attached on first setup. */
  dnsSkipped?: boolean
}

export interface DomainPreflight {
  hostname: string
  zone: { id: string, name: string }
}

export interface DomainPreflightResponse {
  ok: boolean
  domain?: DomainPreflight
  error?: string
}

export interface DnsRecord {
  type?: string
  name?: string
  content?: string
  priority?: number
}

export type DnsAuthRecord = 'mx' | 'spf' | 'dkim' | 'dmarc'
export type DnsAuthStatus = 'ok' | 'missing' | 'unknown'

export interface DnsAuthCheck {
  record: DnsAuthRecord
  label: string
  name: string
  status: DnsAuthStatus
  found: string[]
}

export type DomainDnsAudit = Record<DnsAuthRecord, DnsAuthCheck>

export interface DnsStatusSummary {
  routing: { configured: boolean, missing: string[] }
  sending: { configured: boolean, records: string[] }
  auth?: Record<DnsAuthRecord, DnsAuthStatus>
}

export interface DomainDnsView {
  routing: { records: DnsRecord[], missing: DnsRecord[], status?: string }
  sending: DnsRecord[]
  sendingEnabled: boolean
  dkimSelector?: string
  sendingSubdomain?: { name: string, tag: string }
  audit?: DomainDnsAudit
}

export interface DomainsResponse {
  domains: Domain[]
  dns?: Record<string, DnsStatusSummary>
}

export interface MxConflictRecord { content: string, priority: number }

/** The fields a failed setup response can carry; 409 MX_CONFLICT lists the records in the way. */
export interface SetupResponse {
  error?: string
  code?: string
  warning?: string
  records?: MxConflictRecord[]
  domain?: Domain
  dns?: DomainDnsView
  [key: string]: unknown
}

export interface CreateDomainInput {
  hostname: string
  enableRouting?: boolean
  enableSending?: boolean
  replaceMxRecords?: boolean
  skipDns?: boolean
  sendingProvider?: SendingProvider
  receivingProvider?: ReceivingProvider
}

export interface TrackingHostResponse { hostname: string | null, available: boolean }
