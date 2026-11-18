---
name: attack-surface-query
description: How to read the workspace's attack surface with query_attack_surface — targets, hosts, open ports, HTTP titles and status codes, technologies, TLS certificates, URLs, IPs, DNS records, findings and counts. Covers the query language (from, select, include, where, window, groupBy/aggregate, orderBy, limit, cursor), the operators of each field type, the limits, the errors and ready-made queries. Load before the first query of a task, or when a query comes back with an error.
---

# Attack surface queries

`query_attack_surface` is the one tool for reading what the workspace has recorded about its attack surface. It replaces the old per-topic lookups (`enumerate_assets`, `inspect_asset`, `examine_target_assets`, `list_network_ports`, `fingerprint_technologies`, `verify_tls_settings`, `discover_vulnerabilities`, `retrieve_targets`). Full details of one finding (description, PoC, remediation, evidence, timeline) still come from `investigate_vulnerability`; the dashboard score and trends from `gather_statistics`.

`describe_attack_surface` returns every resource, field, operator and relation you may use (only the ones your permissions allow). Call it when you are unsure of a name; the error of a wrong name also suggests the right one.

## The shape of a call

```json
{
  "window": { "since": "now-7d" },
  "projectId": "<optional: restrict to one project's assets>",
  "queries": {
    "<name>": { "from": "<resource>", "select": [...], "where": {...}, "limit": 50 },
    "<other name>": { ... }
  }
}
```

- One call runs up to **5 named queries**; each comes back under its name: `{ rows, nextCursor, total?, truncated }` or `{ error }`. One failing query does not stop the others. Batch related questions into one call.
- The workspace is always the conversation's. In a project conversation every query is locked to that project; `projectId` only applies outside one. `rollups` cannot be read inside a project.
- Every row has an `id`. Related rows come back nested: `"host.value"` lands in `{ "host": { "value": … } }`; a missing related row is `null`.

## Resources

| from | what a row is | time field (for `window`) |
|---|---|---|
| `targets` | a scan root: domain, IP, CIDR, Git organization | `firstSeen` |
| `hosts` | a domain, subdomain, IP (or repository) found under a target | `firstSeen` |
| `services` | one open port of a host | `firstSeen` |
| `technologies` | a technology seen in a service's **latest** HTTP response | `firstSeen` |
| `tls` | the TLS certificate of a service's **latest** HTTP response | `firstSeen` |
| `urls` | a URL discovered on a service | `firstSeen` |
| `ips` | an IP a host resolves to (DNS A/AAAA) | `firstSeen` |
| `dnsRecords` | a DNS record of a host | `firstSeen` |
| `vulnerabilities` | an approved finding (AI proposals under review never appear) | `firstSeen` |
| `rollups` | pre-computed counts: `metric` (port, technology, webserver, statusCode, tlsVersion), `key`, `value` | none |

Reached only through a relation: `http` (a service's latest HTTP response), `statusCodes`, `tags`, `tools`.

### Fields

- **targets**: `value`, `type` (DOMAIN, IP, CIDR, GIT_ORG), `firstSeen`.
- **hosts**: `value`, `kind` (domain | ip | repository), `isPrimary`, `isEnabled`, `firstSeen`, `lastSeen`, `isNew`.
- **services**: `value` (host:port), `port`, `isErrorPage`, `firstSeen`, `lastSeen`, `isNew`.
- **http**: `url`, `title`, `statusCode`, `webserver`, `scheme`, `contentType`, `contentLength`, `faviconMd5`, `failed`, `probedAt`. (`body`, `rawHeader`, `header` are too large: refused to the agent.)
- **technologies**: `name`, `version`, `firstSeen`.
- **tls**: `host`, `port`, `tlsVersion`, `cipher`, `subjectCn`, `issuerCn`, `notBefore`, `notAfter`, `daysToExpiry` (negative when expired), `wildcard`, `fingerprintSha256`, `firstSeen`.
- **statusCodes**: `statusCode`, `isPrimary` (false = a redirect hop), `chainIndex`. **tags**: `tag`.
- **urls**: `url`, `firstSeen`, `isNew`. **ips**: `ip`, `source` (dns_a | dns_aaaa), `firstSeen`. **dnsRecords**: `recordType`, `value`, `firstSeen`.
- **vulnerabilities**: `name`, `severity` (info | low | medium | high | critical), `cvssScore`, `epssScore`, `cve`, `cwe`, `tags`, `ports` (lists), `affectedUrl`, `detectionStatus` (new | active | resurfaced | fixed), `isOpen` (approved, still detected and not dismissed: the "open" count of every screen), `firstSeen`, `lastSeen`, `fixedAt`.

`isNew` = found by the latest finished run of its workflow on that target (the "new" badge of the console).

### Relations

| from | single related row (select `name.field`) | lists (`include`, or test in `where`) |
|---|---|---|
| targets | – | `hosts` |
| hosts | `target` | `services`, `ips`, `dnsRecords`, `vulnerabilities` |
| services | `host`, `target`, `http` | `technologies`, `tls`, `statusCodes`, `urls`, `tags` |
| technologies, tls, urls | `service` | – |
| ips, dnsRecords | `host` | – |
| vulnerabilities | `host`, `tool` | – |

Dot paths chain single relations, at most two hops in `select` (`service.host.value`, `host.target.value`).

## select and include

- `select`: fields of the resource and of its single related rows. Omit it to get a small default set. At most 20 fields.
- `include`: lists of related rows per result row, each with its own `select`, `where`, `orderBy` and `limit` (default 5, max 20 per row), nested at most 2 levels, 3 per query.

```json
{ "from": "hosts", "select": ["value", "target.value"],
  "include": { "services": { "select": ["port", "http.title"], "limit": 10 } } }
```

A list relation in `select` is an error (`"technologies" is a list … use include.technologies`).

## where

```json
{ "logic": "and", "items": [
  { "field": "port", "op": "in", "value": ["80", "443", "8080"] },
  { "logic": "or", "conditions": [
    { "field": "http.title", "op": "contains", "value": "admin" },
    { "field": "technologies.name", "op": "eq", "value": "Jenkins" } ] } ] }
```

- Up to 20 items; an item is a condition or one group (`logic` + `conditions`). Values are strings, or arrays of strings for `in`/`notIn`/`inSubnet`.
- A **list path** (`technologies.name`, `vulnerabilities.severity`, `services.port`) means "has at least one related row that matches". With a negative operator (`neq`, `notIn`, `notContains`) it means "has **no** related row that matches".

| field type | operators | value |
|---|---|---|
| text | eq, neq, contains, notContains, in, notIn | `contains` is case-insensitive |
| int | eq, neq, in, notIn, gt, gte, lt, lte | `"443"` |
| float | eq, neq, gt, gte, lt, lte | `"7.5"` |
| bool | eq | `"true"` / `"false"` |
| enum | eq, neq, in, notIn | one of the listed values |
| uuid (`id`) | eq, neq, in, notIn | an id |
| ip | eq, neq, in, notIn, inSubnet | `"10.0.0.1"`; inSubnet takes CIDRs: `["10.0.0.0/8"]` |
| timestamp | gt, gte, lt, lte | a time (below) |
| list (cve, cwe, tags, ports) | eq, neq, contains, in, notIn | eq/in: contains that element |

## Time

- A time is `now`, `now-<n><m|h|d|w>` (`now-30m`, `now-24h`, `now-7d`, `now-2w`), `now+<n><unit>` in filters only (`notAfter lt now+30d`), or ISO 8601 **with an offset** (`2026-11-01T00:00:00Z`).
- `window: { since, until? }` keeps rows whose time field is in `[since, until)`; on the batch it applies to every query, on a query it overrides the batch. The field is the resource's time field, or `windowField` (e.g. `"windowField": "lastSeen"`). `"window": null` on a query means all time.
- `rollups` has no time field: give it `"window": null` when the batch has a window.

## Counting and grouping

```json
{ "from": "services", "groupBy": ["port"],
  "aggregate": { "hosts": { "fn": "countDistinct", "field": "host.id" } },
  "orderBy": [{ "field": "hosts", "dir": "desc" }], "limit": 20 }
```

- `fn`: `count` (no field = rows), `countDistinct`, `min`, `max`, `avg` (numbers). Up to 5 aggregates and 3 group keys.
- Group a time with a bucket: `{ "field": "firstSeen", "bucket": "hour" | "day" | "week" | "month" }`.
- An aggregate query has no `select`, `include`, `cursor` or `withTotal`; its `orderBy` names a group key or an aggregate.
- For workspace-wide distributions prefer `rollups` (refreshed every 15 minutes, instant).

## Order, paging, totals

- `orderBy: [{ "field", "dir": "asc" | "desc" }]`, at most 3. Default: newest first. Sorting on fields marked `sortable` in `describe_attack_surface`; sorting on a related row's field is allowed only when the filter keeps the row set small.
- `limit`: default 50, max 200. When more rows exist, `nextCursor` is set: repeat the **same** query with `"cursor": "<nextCursor>"` (a cursor of another query or filter is refused).
- `"withTotal": true` adds `total` (capped at 10 000, `totalCapped`). It costs extra: ask only when you need the number.

## Limits and errors

- Agent limits: 5 queries per call, 200 rows per query, a cost budget per query, 3 s per statement, 64 KB per response (strings over 512 characters are cut, `truncated: true`).
- `INVALID_QUERY`: `issues: [{ path, code, message }]`, every problem at once, with "Did you mean" hints. Fix all of them and call again.
- `COST_EXCEEDED`: the query is too broad; `hints` say what to change (add a window, filter on an indexed field with eq/in instead of contains, lower the limit, fewer includes).
- `PERMISSION_DENIED`: the member cannot read a resource the query touches (e.g. `vulnerabilities` without vulnerability.read). Drop that part.
- `QUERY_TIMEOUT` / `BUSY`: narrow the query, or retry once.
- Never guess field names from the old tools' output: use the names above or `describe_attack_surface`.

## Recipes

What was found recently:

```json
{ "window": { "since": "now-5d" }, "queries": {
  "newHosts": { "from": "hosts", "select": ["value", "kind", "firstSeen", "target.value"],
                "where": { "logic": "and", "items": [{ "field": "kind", "op": "eq", "value": "domain" }] } },
  "newPorts": { "from": "services", "select": ["port", "host.value", "http.title", "http.statusCode"] },
  "newFindings": { "from": "vulnerabilities", "select": ["name", "severity", "host.value"],
                   "where": { "logic": "and", "items": [{ "field": "isOpen", "op": "eq", "value": "true" }] } } } }
```

Targets and the hosts under one target:

```json
{ "queries": {
  "targets": { "from": "targets", "select": ["value", "type"], "window": null, "limit": 200 },
  "hosts": { "from": "hosts", "select": ["value", "isPrimary"], "window": null,
             "where": { "logic": "and", "items": [{ "field": "target.value", "op": "eq", "value": "example.com" }] } } } }
```

Everything known about one host (instead of inspect_asset):

```json
{ "queries": { "host": { "from": "hosts", "select": ["value", "kind", "firstSeen", "lastSeen", "target.value"], "window": null,
  "where": { "logic": "and", "items": [{ "field": "value", "op": "eq", "value": "api.example.com" }] },
  "include": {
    "services": { "select": ["port", "http.title", "http.statusCode", "http.webserver"], "limit": 20,
                  "include": { "technologies": { "select": ["name", "version"] } } },
    "ips": { "select": ["ip"] },
    "vulnerabilities": { "select": ["name", "severity", "detectionStatus"], "limit": 20 } } } } }
```

Exposure checks:

```json
{ "queries": {
  "adminPanels": { "from": "services", "select": ["host.value", "port", "http.title"], "window": null,
                   "where": { "logic": "or", "items": [
                     { "field": "http.title", "op": "contains", "value": "admin" },
                     { "field": "http.title", "op": "contains", "value": "login" } ] } },
  "riskyPorts": { "from": "services", "select": ["host.value", "port"], "window": null,
                  "where": { "logic": "and", "items": [{ "field": "port", "op": "in", "value": ["21", "23", "445", "3306", "3389", "5432", "6379", "9200", "27017"] }] } },
  "expiringTls": { "from": "tls", "select": ["host", "port", "notAfter", "issuerCn"], "window": null,
                   "where": { "logic": "and", "items": [{ "field": "notAfter", "op": "lt", "value": "now+30d" }] },
                   "orderBy": [{ "field": "notAfter", "dir": "asc" }] },
  "inRange": { "from": "ips", "select": ["ip", "host.value"], "window": null,
               "where": { "logic": "and", "items": [{ "field": "ip", "op": "inSubnet", "value": ["203.0.113.0/24"] }] } } } }
```

Who runs a technology (and which version):

```json
{ "queries": {
  "nginx": { "from": "technologies", "select": ["name", "version", "service.host.value", "service.port"], "window": null,
             "where": { "logic": "and", "items": [{ "field": "name", "op": "eq", "value": "nginx" }] }, "limit": 100 },
  "versions": { "from": "technologies", "groupBy": ["name", "version"], "aggregate": { "services": { "fn": "count" } },
                "orderBy": [{ "field": "services", "dir": "desc" }], "window": null, "limit": 50 } } }
```

Findings (instead of discover_vulnerabilities; then `investigate_vulnerability` with an `id` for the details):

```json
{ "queries": {
  "open": { "from": "vulnerabilities", "select": ["name", "severity", "cvssScore", "cve", "host.value", "detectionStatus"], "window": null,
            "where": { "logic": "and", "items": [
              { "field": "isOpen", "op": "eq", "value": "true" },
              { "field": "severity", "op": "in", "value": ["critical", "high"] } ] },
            "orderBy": [{ "field": "cvssScore", "dir": "desc" }] },
  "byCve": { "from": "vulnerabilities", "select": ["name", "host.value"], "window": null,
             "where": { "logic": "and", "items": [{ "field": "cve", "op": "eq", "value": "CVE-2024-3400" }] } },
  "bySeverity": { "from": "vulnerabilities", "groupBy": ["severity"], "aggregate": { "n": { "fn": "count" } }, "window": null,
                  "where": { "logic": "and", "items": [{ "field": "isOpen", "op": "eq", "value": "true" }] } },
  "hostsWithCritical": { "from": "hosts", "select": ["value"], "window": null,
                         "where": { "logic": "and", "items": [{ "field": "vulnerabilities.severity", "op": "eq", "value": "critical" }] } } } }
```

Trends and distributions:

```json
{ "window": { "since": "now-30d" }, "queries": {
  "hostsPerDay": { "from": "hosts", "groupBy": [{ "field": "firstSeen", "bucket": "day" }], "aggregate": { "n": { "fn": "count" } }, "limit": 31 },
  "topPorts": { "from": "rollups", "select": ["key", "value"], "window": null,
                "where": { "logic": "and", "items": [{ "field": "metric", "op": "eq", "value": "port" }] }, "limit": 20 } } }
```

## Method

1. Start from what the workspace already knows: one batched call that answers the whole question beats many small ones.
2. Ask for the fields you will use, not everything; add `include` only when you need the related rows of each result.
3. Filter in the query (`where`, `window`), not in your head: a 200-row page you then skim is slower and less complete.
4. When `nextCursor` is set and you need the rest, page with it; otherwise say how many you looked at (`withTotal`) instead of implying you saw everything.
5. Quote values from the rows (host, port, title, version, dates) in your answer; ids are for follow-up calls (`investigate_vulnerability`, `propose_vulnerability`'s `assetId` = a host's `id`), not for the user.
