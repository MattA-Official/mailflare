import * as esbuild from "esbuild";
import { aliasPlugin } from "./paths.mjs";

/**
 * esbuild's `build`, with the server's aliases (#lib, #db, #handlers and the runtime stubs) resolved
 * after the test's own plugins, so a test's mocks still win over the real modules.
 */
export function build(options) {
	return esbuild.build({ ...options, plugins: [...(options.plugins ?? []), aliasPlugin] });
}
