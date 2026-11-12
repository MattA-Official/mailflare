export default defineEventHandler(async (event) => {
  const env = getEnv(event)
  const d1 = await env.DB.prepare('select 1 as ok').first<{ ok: number }>()
  return {
    ok: true,
    d1: d1?.ok === 1,
    bindings: {
      bucket: !!env.BUCKET, kv: !!env.KV, cache: !!env.CACHE, realtime: !!env.REALTIME,
      queues: !!env.INBOUND_QUEUE && !!env.OUTBOUND_QUEUE && !!env.AGENT_QUEUE,
      ai: !!env.AI, email: !!env.EMAIL,
    },
  }
})
