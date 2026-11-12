// Stands in for the Worker runtime's `cloudflare:workers` module in unit tests. `env` forwards to the
// bindings a test installs as globalThis.__mailflareNodeEnv (the name upstream's tests used for the
// self-hosted runtime's env), so `getEnv()` returns them.
export const env = new Proxy({}, {
	get: (_target, property) => globalThis.__mailflareNodeEnv?.[property],
	has: (_target, property) => !!globalThis.__mailflareNodeEnv && property in globalThis.__mailflareNodeEnv,
	ownKeys: () => Reflect.ownKeys(globalThis.__mailflareNodeEnv ?? {}),
	getOwnPropertyDescriptor: (_target, property) => globalThis.__mailflareNodeEnv && property in globalThis.__mailflareNodeEnv ? { configurable: true, enumerable: true, value: globalThis.__mailflareNodeEnv[property] } : undefined,
});
