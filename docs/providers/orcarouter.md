# OrcaRouter Cyber Inference

[OrcaRouter](https://www.orcarouter.ai) is an OpenAI-compatible AI gateway that
routes many models behind a single endpoint. OASM ships it as a named provider,
so the agents, asset tagging and MCP/subagent runs can use it without a custom
endpoint.

- Provider id: `orcarouter`
- Inference and catalog origin: `https://api.orcarouter.ai/v1`
- Keys are issued with the `sk-orca-` prefix.

## Connecting

Open **Providers → OrcaRouter Cyber Inference → Connect**. Both credential
choices produce the same durable API key and the same stored configuration:

1. **API Key** — paste a key created in the
   [OrcaRouter console](https://www.orcarouter.ai).
2. **Connect with OrcaRouter** — OAuth 2.0 with PKCE (S256, no client secret).
   OASM uses the out-of-band flow: open the consent page, then paste the code it
   shows. This is the flow that works for a self-hosted deployment whose console
   is not on the same host as the API, where a loopback redirect could never be
   reached. The verifier lives only in Redis for ten minutes, is single-use, and
   is never written to the URL or logs. The authorization endpoint is
   `https://www.orcarouter.ai/auth` and the key exchange is
   `https://www.orcarouter.ai/api/v1/auth/keys`.

The issued key is encrypted with the workspace key and stored with the rest of
the provider configuration. It can be revoked at any time from the OrcaRouter
console.

## Models

The model list comes from
`GET https://api.orcarouter.ai/v1/models?capability=chat` using the workspace
key. OASM calls OrcaRouter through OpenAI chat completions, so only models
whose `supported_endpoint_types` include `openai` are shown; models reachable
only through another wire format, and image, embedding, rerank and video
routes, are filtered out, and a model without capability metadata is not
guessed. If the catalog is unreachable a small verified seed is shown and
flagged as an offline list; live results are never merged with it, and the
offline list is not cached.

A pasted key is saved only once the live catalog accepts it. A key issued by
"Connect with OrcaRouter" is saved even while the catalog is unreachable.

The selector lists the tiers in a fixed order:

| Tier | Model id | Notes |
| --- | --- | --- |
| Default | `orcarouter/auto` | Routes automatically. |
| Cyber | `orca/orcacyber-ultra-1.0` | OrcaCyber Ultra, for business-verified security teams. |
| Cyber | `orca/orcacyber-zero-1.5` | OrcaCyber Zero, for business-verified security teams. |
| Fallback | `orcarouter/fusion` | General fallback. |

See [OrcaRouter for security teams](https://www.orcarouter.ai/cyber) and the
[cyber model catalog](https://www.orcarouter.ai/models?tier=cyber).

## Deployment overrides

Defaults are the public origins. Self-hosted relays can override them; an
explicit variable always wins over the shared one.

| Variable | Effect |
| --- | --- |
| `ORCA_AUTH_BASE_URL` | Authorization, consent and key exchange origin. |
| `ORCA_API_BASE_URL` | Inference and model catalog origin (include `/v1`). |
| `ORCA_BASE_URL` | Shared origin; the API side appends `/v1`. |

HTTPS is required except for loopback hosts during development.

## Revoked keys

When the gateway rejects a stored key with `401` (on any request: chat,
subagents, asset tagging or the model list), the connection is marked
**reconnect required** for that exact key. A `403`, such as a model that needs
a business-verified account, does not mark it. The stored key is not deleted:
connecting OrcaRouter again, or pasting a new key, replaces the key on the
marked connection and keeps its model and default status. A late `401` from a
key that has already been replaced never marks the new one.
