---
name: api-testing
description: API security testing methodology — endpoint and schema discovery, object-level and function-level authorization, version and environment confusion, mass assignment, injection through JSON/GraphQL, rate and resource abuse, and data extraction from verbose API responses. Load when the target exposes a REST, GraphQL, gRPC-web or RPC API rather than (or as well as) a rendered web app.
---

# API testing

An API is a direct wire to the application's data model. There is no renderer in the way and no HTML escaping to hide behind: whatever the model holds is one well-formed request away.

## Discovery

1. **Specification first.** `/openapi.json`, `/swagger.json`, `/v2/api-docs`, `/api-docs`, `/graphql` (introspection), `/docs`, `/redoc`: a schema gives you every route, parameter and model at once. Fetch it before crawling.
2. **Mine the clients.** Every JS bundle, mobile app, and source map names endpoints, parameters, headers and versions. Grep the bundles for path fragments and fetch what they reveal.
3. **Version and environment sweep.** If `/v2/` exists, so probably do `/v1/`, `/v3/`, `/beta/`, `/internal/`, `/admin/`, `/legacy/`. Old versions are usually the least defended and often still served. The same for hosts: api, api-dev, api-staging, api-internal, api-mobile.
4. **Method sweep.** Every discovered path gets the methods it does not advertise: `OPTIONS`, `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `HEAD`. A 405 on one method is not a 405 on all of them.

## Authorization — where APIs actually fail

- **Object level (BOLA/IDOR).** Take every identifier in a path, query or body (id, uuid, slug, account, tenant, org, invoice, file, message) and request it as a *different* identity. Compare: does the other user's data come back? Sequential or guessable ids make this the highest-yield test in the whole class.
- **Function level (BFLA).** The same endpoint with a low-privilege token; a privileged route with a normal token; an admin route reachable by path rewriting (`/api/users` vs `/api/admin/users` vs `/internal/api/users`).
- **Property level.** Add fields the client never sends: `role`, `isAdmin`, `tenantId`, `plan`, `verified`, `balance`, `ownerId`. If the model binds them, the API just let you escalate. That is mass assignment, and it is one request away on most CRUD endpoints.
- **Missing auth entirely.** Strip the `Authorization` header, then replace it with an empty, an expired, a foreign-algorithm or a self-signed token. Compare the response body, not just the status code: a 200 with an error object is a rejection, a 200 with data is a breach.

## Injection through API shapes

- JSON bodies reach the same sinks as form fields: SQL, NoSQL operators (`{"$ne": null}`, `{"$gt": ""}`, array-vs-scalar type confusion), command, template, LDAP, and the ORM's own query DSL. Try the operator injection before the string payload — NoSQL APIs fall to it constantly.
- Content type confusion: send the same body as `application/json`, `application/xml`, `application/x-www-form-urlencoded` and `text/plain`. A parser chosen by content type is a second attack surface, and XXE lives in the XML branch.
- GraphQL: introspection first; then field-level authorization (query another user's fields), batching (many operations in one request to defeat rate limits), depth and alias amplification, and mutation fields the schema exposes but the UI never calls.
- Header trust: `X-Forwarded-For`, `X-Original-URL`, `X-Rewrite-URL`, `X-HTTP-Method-Override`, `X-User-Id`, `X-Tenant`. Anything the gateway sets and the app trusts is a bypass if you can set it too.
- Pagination abuse: `limit=100000`, `per_page=-1`, `page=0`, offset overflow, and sort/order fields used raw in a query.

## Extraction

- Verbose responses are the point of API testing: error traces, stack frames, query fragments, internal hostnames, model names, other users' fields in a shared serializer, and `_links`/`_embedded` that reveal routes the docs never mention.
- Diff the shape of responses between roles and between versions: a field that appears for an admin and also for you is a leak; a field that disappears in v2 is still served in v1.
- Record the exact request and the decisive response for every finding, with the identity used. "Different data returned" is only a finding with both sides recorded.

## Rules

- One identity per request, stated in the evidence; never mix sessions inside one comparison.
- Rate-limit yourself and back off on 429s: an API you knock over is an outage, not a finding.
- Prove the condition without harvesting: one object reachable is a finding; ten thousand rows is a data breach you caused.
- Save every confirmed candidate with its request/response to `stm_write` as you go.

## Output

Per endpoint group: what it accepts, what authorization it enforces (proven, not assumed), the candidates with verdicts and evidence, the versions and hosts that answer, and the data the responses leak. Then what is still untested.
