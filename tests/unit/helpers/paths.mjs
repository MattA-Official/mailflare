import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root. */
export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * The server's import aliases, for tests that bundle a module with esbuild (to replace some of its
 * imports with literal mocks). `cloudflare:workers` is the Worker runtime module; tests get a stub.
 */
export const alias = {
	"~": join(root, "app"),
	"#lib": join(root, "server/lib"),
	"#db": join(root, "server/db"),
	"#handlers": join(root, "server/handlers"),
	"cloudflare:workers": join(root, "tests/unit/helpers/cloudflare-workers.mjs"),
	"nitropack/runtime": join(root, "tests/unit/helpers/nitropack-runtime.mjs"),
};

const aliasPattern = /^(~|#lib|#db|#handlers)(\/.*)?$|^cloudflare:workers$|^nitropack\/runtime$/;

/**
 * esbuild plugin resolving the aliases above. A plugin rather than esbuild's `alias` option, because
 * `packages: "external"` would otherwise leave `#lib/...` imports external, and because tests pass
 * their own `alias` maps.
 */
export const aliasPlugin = {
	name: "mailflare-aliases",
	setup(builder) {
		builder.onResolve({ filter: aliasPattern }, async (args) => {
			if (args.pluginData?.mailflareAlias) return undefined;
			const match = args.path.match(/^(~(?=\/|$)|#lib|#db|#handlers|cloudflare:workers|nitropack\/runtime)(.*)$/);
			const target = alias[match[1]] + (match[2] ?? "");
			const result = await builder.resolve(target, { kind: args.kind, resolveDir: args.resolveDir, importer: args.importer, pluginData: { mailflareAlias: true } });
			return result.errors.length ? { errors: result.errors } : { path: result.path, external: result.external, namespace: result.namespace };
		});
	},
};
