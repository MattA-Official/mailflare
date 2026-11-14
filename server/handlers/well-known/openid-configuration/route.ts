// Fork-only. OpenID Connect discovery for the provider (server/lib/oidc).
import { getEnv } from "#lib/cloudflare";
import { publicJson } from "#lib/oidc/http";
import { getIssuer, SUPPORTED_SCOPES } from "#lib/oidc/service";

export async function GET(request: Request) {
	const issuer = getIssuer(getEnv(), request);
	return publicJson({
		issuer,
		authorization_endpoint: `${issuer}/oauth/authorize`,
		token_endpoint: `${issuer}/oauth/token`,
		userinfo_endpoint: `${issuer}/oauth/userinfo`,
		jwks_uri: `${issuer}/oauth/jwks`,
		revocation_endpoint: `${issuer}/oauth/revoke`,
		response_types_supported: ["code"],
		response_modes_supported: ["query"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: ["ES256"],
		scopes_supported: SUPPORTED_SCOPES,
		claims_supported: ["sub", "iss", "aud", "exp", "iat", "auth_time", "nonce", "amr", "azp", "email", "email_verified", "name", "roles"],
		code_challenge_methods_supported: ["S256"],
		token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
		revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
		prompt_values_supported: ["none", "login"],
		authorization_response_iss_parameter_supported: true,
		request_parameter_supported: false,
		request_uri_parameter_supported: false,
	});
}

export const dynamic = "force-dynamic";
