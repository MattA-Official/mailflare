const NAMES = ["useState", "appScoped", "effectScope"];

/**
 * Stands in for Nuxt's `useState` and the app's `appScoped` (app/utils/app-scoped.ts) when a test
 * bundles a composable with `importAppModule`: both are auto-imports there, so they are left as free
 * identifiers. Each install starts from an empty app; call the returned function to remove them.
 * Pass the test's `vue` module: importing Vue here would load its DOM runtime before `installDom`.
 */
export function installNuxtState({ effectScope, isRef, ref }) {
	const state = new Map();
	const scoped = new Map();
	Object.assign(globalThis, {
		useState(key, init) {
			if (!state.has(key)) {
				const initial = init?.();
				// Nuxt lets init return a ref (e.g. shallowRef) and keeps it as the state.
				state.set(key, isRef(initial) ? initial : ref(initial));
			}
			return state.get(key);
		},
		appScoped(key, init) {
			if (!scoped.has(key)) scoped.set(key, init());
			return scoped.get(key);
		},
		effectScope,
	});
	return () => {
		for (const name of NAMES) delete globalThis[name];
	};
}
