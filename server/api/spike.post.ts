// Temporary: proves queue producer -> consumer and Durable Object notify. Removed once the mail pipeline lands.
export default defineEventHandler(async (event) => {
  const env = getEnv(event)
  const { user = 'spike' } = getQuery(event) as { user?: string }
  await env.INBOUND_QUEUE.send({ spike: true, at: Date.now() })
  const hub = env.REALTIME.get(env.REALTIME.idFromName(user))
  const res = await hub.fetch('https://mailflare-realtime/notify', { method: 'POST', body: JSON.stringify({ type: 'spike', at: Date.now() }) })
  return { queued: true, notified: res.status, lastQueue: await env.KV.get('spike:queue:mailflare-inbound'), lastCron: await env.KV.get('spike:cron') }
})
