import { getEnv } from '#lib/cloudflare'

export default defineEventHandler(async () => {
  const env = getEnv()
  const d1 = await env.DB.prepare('select 1 as ok').first<{ ok: number }>()
  return { ok: true, d1: d1?.ok === 1 }
})
