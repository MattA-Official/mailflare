// Stands in for `nitropack/runtime` in unit tests. There is no request context outside Nitro, so
// `useEvent()` returns the h3 event a test installs on globalThis.__mailflareTestEvent, or an empty one:
// next-compat's `cookies()` then finds no cookies and records any it sets.
function emptyEvent() {
	const headers = {};
	return {
		node: {
			req: { headers: {}, method: "GET", url: "/" },
			res: {
				getHeader: (name) => headers[name.toLowerCase()],
				setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
				removeHeader: (name) => { delete headers[name.toLowerCase()]; },
			},
		},
		context: {},
	};
}

export function useEvent() {
	return globalThis.__mailflareTestEvent ?? emptyEvent();
}
