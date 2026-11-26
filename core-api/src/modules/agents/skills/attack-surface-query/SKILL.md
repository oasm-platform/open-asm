---
name: attack-surface-query
description: How to read the workspace's attack surface with query_attack_surface — targets, hosts, open ports, HTTP titles and status codes, technologies, TLS certificates, URLs, IPs, DNS records, findings and counts. The rules that make the first call succeed, every field and operator, the cost budget, the errors and how to fix them, and ready-made queries. Load before the first query of a conversation, and again when a query comes back with an error.
---

# Attack surface queries

`query_attack_surface` is the **only** way to read what the workspace recorded about its attack surface: targets, hosts, services (open ports), HTTP responses, technologies, TLS, URLs, IPs, DNS records, findings and counts. Any question about them — "which targets do I have", "what is open on X", "who runs nginx", "what is critical" — is answered with this tool, never from memory or from what an earlier message said. Full details of one finding (description, PoC, remediation, evidence, timeline) come from `investigate_vulnerability` with a finding `id`; the dashboard score and trends from `gather_statistics`.

## Rules — read before the first call

1. **Only real names.** Use the resource and field names of this skill (the tool description lists them too). Never invent a field: `targets` has no `lastSeen`, `services` has no `host` field (it is the relation `host.value`). Unsure? `describe_attack_surface`.
2. **One call per question.** Put every sub-question into one call as named queries (up to 5). Do not send a probing call first.
3. **select vs include vs where.** `select` takes fields of the row and of its *related rows* (`host.value`, `http.title`, `target.value`). *Lists* (`services`, `technologies`, `vulnerabilities`, `urls`…) never go in `select`: fetch them with `include`, or test them in `where`.
4. **Time.** No `window` = all time. Set `"window": { "since": "now-7d" }` only when the question is about something recent ("new", "this week").
5. **Size.** `limit` ≤ 200 (default 50). Each `include` fetches up to its own `limit` (≤ 20, default 5) **per row**: keep `limit × include limit` small (50 × 5). For a big inventory, query the child resource directly with a filter instead of including it under 200 parents.
6. **Totals only when needed.** `"withTotal": true` costs extra; a count is cheaper as an aggregate.
7. **On an error, fix everything at once.** The error lists every problem with its path and the valid names. Fix all of them and resend the whole call once. Do not loop on guesses.
8. **Quote, do not dump.** Answer from the rows (host, port, title, version, dates). Keep ids for follow-up calls (`investigate_vulnerability`, `propose_vulnerability`'s `assetId` = a host `id`), not for the user.

## The shape of a call

```json
{
  "window": { "since": "now-7d" },
  "projectId": "<optional: restrict to one project's assets>",
  "queries": {
    "<name>": { "from": "<resource>", "select": ["<field>", "<relation>.<field>"], "where": { "logic": "and", "items": [] }, "limit": 50 },
    "<other name>": { "from": "<resource>", "groupBy": ["<field>"], "aggregate": { "n": { "fn": "count" } } }
  }
}
```

- Each query comes back under its name: `{ rows, nextCursor, total?, truncated }` or `{ error }`. One failing query does not stop the others.
- The workspace is always the conversation's. In a project conversation every query is locked to that project; `projectId` only applies outside one. `rollups` cannot be read inside a project.
- Rows are nested: `"host.value"` comes back as `{ "host": { "value": … } }`; a missing related row is `null`. Every row has an `id`.

## Resources and fields

| from | a row is | fields (`id` on every row) | related (select `x.field`) | lists (include / where) |
|---|---|---|---|---|
| `targets` | a scan root | `value`, `type` (DOMAIN, CIDR, IP, GIT_ORG), `firstSeen` | – | `hosts` |
| `hosts` | a domain, subdomain, IP or repository under a target | `value`, `kind` (domain, ip, repository), `isPrimary`, `isEnabled`, `firstSeen`, `lastSeen`, `isNew` | `target` | `services`, `ips`, `dnsRecords`, `vulnerabilities` |
| `services` | one open port of a host | `value` (host:port), `port`, `isErrorPage`, `firstSeen`, `lastSeen`, `isNew` | `host`, `target`, `http` | `technologies`, `tls`, `statusCodes`, `urls`, `tags` |
| `technologies` | a technology in a service's latest HTTP response | `name`, `version`, `firstSeen` | `service` | – |
| `tls` | the certificate of a service's latest HTTP response | `host`, `port`, `tlsVersion`, `cipher`, `subjectCn`, `issuerCn`, `notBefore`, `notAfter`, `daysToExpiry`, `wildcard`, `fingerprintSha256`, `firstSeen` | `service` | – |
| `urls` | a URL discovered on a service | `url`, `firstSeen`, `isNew` | `service` | – |
| `ips` | an IP a host resolves to | `ip`, `source` (dns_a, dns_aaaa), `firstSeen` | `host` | – |
| `dnsRecords` | a DNS record of a host | `recordType`, `value`, `firstSeen` | `host` | – |
| `vulnerabilities` | an approved finding | `name`, `severity` (info, low, medium, high, critical), `cvssScore`, `epssScore`, `cve`, `cwe`, `tags`, `ports`, `affectedUrl`, `detectionStatus` (new, active, resurfaced, fixed), `isOpen`, `firstSeen`, `lastSeen`, `fixedAt`, `cvssMetric`, `vprScore`, `bid`, `references`, `ipAddress`, `hostName`, `publishedAt`, `firstDetected`, `analyzeStatus`, `isDismissed` | `host`, `tool` | – |
| `tags` | a tag of a service | `tag`, `firstSeen` | `service` | – |
| `rollups` | a pre-computed count | `metric` (port, technology, webserver, statusCode, tlsVersion), `key`, `value`, `computedAt` | – | – |

Only through a relation: `http` = a service's latest HTTP response (`url`, `title`, `statusCode`, `webserver`, `scheme`, `contentType`, `contentLength`, `faviconMd5`, `failed`, `probedAt`; `body`/`rawHeader`/`header` are too large for the agent), `statusCodes` (`statusCode`, `isPrimary`, `chainIndex`), `tools` (`name`). A finding's `description` and `solution` are too large for the agent.

- `isNew`: found by the latest finished run of its workflow on that target (the "new" badge).
- `isOpen`: approved, still detected and not dismissed — the "open" count of every screen. AI proposals under review never appear.
- `cve`, `cwe`, `tags`, `ports`, `bid`, `references` of a finding are lists of strings.
- `isDismissed`: dismissed or risk accepted, and the dismissal has not expired.
- Dot paths chain at most two related rows in `select` (`service.host.value`).

## where

```json
{ "queries": { "exposed": { "from": "services", "select": ["host.value", "port", "http.title"], "where": { "logic": "and", "items": [
  { "field": "port", "op": "in", "value": ["80", "443", "8080"] },
  { "logic": "or", "conditions": [
    { "field": "http.title", "op": "contains", "value": "admin" },
    { "field": "technologies.name", "op": "eq", "value": "Jenkins" } ] } ] } } } }
```

- An item is a condition, a group `{ "logic": "and" | "or", "items": [...] }` (groups nest up to 4 levels; the old `"conditions"` key still works), a negation `{ "not": <item> }`, or a relation test (below). At most 20 conditions per filter. Values are **strings**; arrays of strings for `in`, `notIn`, `inSubnet`, `notInSubnet`, `containsAll`, `containsAny`; `[from, to]` for `between`; no `value` for `isNull` / `isNotNull`.
- A **list path** (`technologies.name`, `vulnerabilities.severity`, `services.port`) means "has at least one related row that matches"; with `neq`/`notIn`/`notContains` it means "has **no** related row that matches".

| field type | operators | value |
|---|---|---|
| text | eq, neq, contains, notContains, startsWith, endsWith, in, notIn | case-insensitive for contains/startsWith/endsWith |
| int (`port`, `statusCode`…) | eq, neq, in, notIn, gt, gte, lt, lte, between | `"443"`; between `["1", "1024"]` (both ends included) |
| number (`cvssScore`, `epssScore`) | eq, neq, gt, gte, lt, lte, between | `"7.5"` |
| bool (`isOpen`, `isNew`…) | eq, neq | `"true"` / `"false"` |
| enum (`type`, `kind`, `severity`…) | eq, neq, in, notIn | one of the listed values |
| id | eq, neq, in, notIn | an id from an earlier row |
| ip | eq, neq, in, notIn, inSubnet, notInSubnet | `"10.0.0.1"`; the subnet ops take CIDRs: `["10.0.0.0/8"]` |
| time | gt, gte, lt, lte, between | a time (below); between `["now-7d", "now"]` |
| list (`cve`, `cwe`, `tags`, `ports`) | eq, neq, contains, in, notIn, containsAll, containsAny | eq/in: contains that element; containsAll: every listed element |
| any field that may be empty (`lastSeen`, `version`, `cvssScore`…) | isNull, isNotNull | no value |

`contains`, `startsWith` and `endsWith` on `value`, `url`, `title`, `name` of findings are slower than `eq`/`in`: prefer exact values when you have them.

### Relation tests

A relation test checks the related rows of a list as a whole:

```
{ "relation": "<list>", "quantifier": "some" | "none" | "every", "where": { "logic": "and", "items": [...] } }
{ "relation": "<list>", "count": { "op": "eq" | "neq" | "gt" | "gte" | "lt" | "lte", "value": "<n>" }, "where"?: {...} }
```

- `relation` is a list of the resource (`services` on hosts), or one reached through related rows (`host.vulnerabilities` on services).
- `some` (the default): at least one related row matches `where` (no `where`: has any). `none`: no related row matches. `every`: every related row matches (needs `where`; a row with no related rows passes).
- `count`: the number of related rows (matching `where`, if given) compared with a number.
- Inside `where` the fields are the related resource's (`port`, not `services.port`); no list inside it.

## Time

- A time is `now`, `now-<n><m|h|d|w>` (`now-30m`, `now-24h`, `now-7d`, `now-2w`), `now+<n><unit>` in filters only (`notAfter lt now+30d`), or ISO 8601 **with an offset** (`2026-11-01T00:00:00Z`).
- `window: { since, until? }` keeps rows whose time field (`firstSeen`, or `windowField`, e.g. `"windowField": "lastSeen"`) is in `[since, until)`. On the call it applies to every query; on a query it overrides the call's; `"window": null` on a query means all time.
- `rollups` has no time field: give it `"window": null` when the call has a window.

## Counting and grouping

- `aggregate: { "<name>": { "fn": "count" | "countDistinct" | "sum" | "min" | "max" | "avg", "field"?: "…", "where"?: {...} } }` (count without a field counts rows; sum and avg need a number). `where` on an aggregate counts only the rows it matches: one query gives a whole matrix (open, critical, high… per host). Up to 8 aggregates, 3 group keys.
- `groupBy` takes groupable fields, related ones too (`target.value`, `host.value`). A time needs a bucket: `{ "field": "firstSeen", "bucket": "hour" | "day" | "week" | "month" }`.
- `having` filters the grouped rows; its fields are the group keys and the aggregate names: `"having": { "logic": "and", "items": [{ "field": "critical", "op": "gt", "value": "0" }] }` (eq, neq, in, notIn; gt, gte, lt, lte on numbers and times).
- `"fill": true` returns every bucket of the window, the empty ones with 0 (needs a `window` and one time group key). Time buckets are cut in UTC; `"options": { "timezone": "Asia/Ho_Chi_Minh" }` on the call cuts them in that zone.
- An aggregate query has no `select`, `include`, `cursor` or `withTotal`; its `orderBy` names a group key or an aggregate name.
- Workspace-wide distributions (ports, technologies, webservers, status codes, TLS versions) are instant in `rollups` (refreshed every 15 minutes).

## Order, paging, totals

- `orderBy: [{ "field", "dir": "asc" | "desc" }]`, at most 3. Default newest first. Sortable: `firstSeen`, `lastSeen`, `port`, `notAfter`, `value` (targets, hosts), `name` (technologies), `title` / `statusCode` (http), `cvssScore` / `epssScore` (findings), `value` (rollups).
- More rows than `limit`: `nextCursor` is set; resend the **same** query with `"cursor": "<nextCursor>"`.
- `"withTotal": true` adds `total` (capped at 10 000).

## Limits and cost

- Per call: 5 queries; per query: 200 rows, 20 selected fields, 3 includes in total (nested ones count) at most 2 deep, include limit 20; 3 s per statement; 64 KB per answer (long strings are cut, `truncated: true`).
- Every query has a cost budget. A full page of any resource over all time with a total, or an all-time count, fits. What does not: includes that multiply rows (200 parents × 20 children), `contains` searches on large pages, too many related fields on 200 rows.
- `COST_EXCEEDED` comes with `hints`: follow them (lower `limit` or the include `limit`, use `eq`/`in`, query the child resource directly).

## Errors and how to fix them

| error | typical cause | fix |
|---|---|---|
| `UNKNOWN_FIELD` | a guessed name (`targets.lastSeen`) | use a name from the message: it lists every field of that resource |
| `UNKNOWN_RELATION` / "is a list" | a list in `select` (`technologies.name`) | move it to `include`, or test it in `where` |
| `NOT_GROUPABLE` / `NOT_SORTABLE` | a field that cannot be grouped or sorted | pick one from the list in the message; a time needs a bucket |
| `OP_NOT_ALLOWED` / `INVALID_VALUE` | `contains` on a number, a non-string value, a bad enum | see the operator table; values are strings |
| `INVALID_TIME` | `"7 days ago"`, an ISO time without offset | `now-7d`, `2026-11-01T00:00:00Z` |
| `COST_EXCEEDED` | include fan-out, broad `contains` | follow `hints` |
| `PERMISSION_DENIED` | the member cannot read that resource | drop that query and say what you could not read |
| `QUERY_TIMEOUT` / `BUSY` | a heavy query, a busy database | narrow it, or retry once |

## Recipes

Targets, with how many hosts each has:

```json
{ "queries": {
  "targets": { "from": "targets", "select": ["value", "type", "firstSeen"], "limit": 200 },
  "hostsPerTarget": { "from": "hosts", "groupBy": ["target.value"], "aggregate": { "hosts": { "fn": "count" } }, "orderBy": [{ "field": "hosts", "dir": "desc" }], "limit": 200 } } }
```

The hosts of one target:

```json
{ "queries": { "hosts": { "from": "hosts", "select": ["value", "kind", "isPrimary", "lastSeen"], "limit": 200,
  "where": { "logic": "and", "items": [{ "field": "target.value", "op": "eq", "value": "example.com" }] } } } }
```

What was found recently:

```json
{ "window": { "since": "now-5d" }, "queries": {
  "newHosts": { "from": "hosts", "select": ["value", "kind", "firstSeen", "target.value"],
                "where": { "logic": "and", "items": [{ "field": "kind", "op": "eq", "value": "domain" }] } },
  "newPorts": { "from": "services", "select": ["port", "host.value", "http.title", "http.statusCode"] },
  "newFindings": { "from": "vulnerabilities", "select": ["name", "severity", "host.value"],
                   "where": { "logic": "and", "items": [{ "field": "isOpen", "op": "eq", "value": "true" }] } } } }
```

Everything known about one host (at most 3 includes per query, nested ones count: the IPs are a second query of the same call):

```json
{ "queries": {
  "host": { "from": "hosts", "select": ["value", "kind", "firstSeen", "lastSeen", "target.value"], "limit": 1,
    "where": { "logic": "and", "items": [{ "field": "value", "op": "eq", "value": "api.example.com" }] },
    "include": {
      "services": { "select": ["port", "http.title", "http.statusCode", "http.webserver"], "limit": 20,
                    "include": { "technologies": { "select": ["name", "version"] } } },
      "vulnerabilities": { "select": ["name", "severity", "detectionStatus"], "limit": 20 } } },
  "ips": { "from": "ips", "select": ["ip", "source"],
           "where": { "logic": "and", "items": [{ "field": "host.value", "op": "eq", "value": "api.example.com" }] } } } }
```

Inventory overview (counts, no rows):

```json
{ "queries": {
  "hostsByKind": { "from": "hosts", "groupBy": ["kind"], "aggregate": { "n": { "fn": "count" } } },
  "portsOpen": { "from": "services", "groupBy": ["port"], "aggregate": { "hosts": { "fn": "countDistinct", "field": "host.id" } }, "orderBy": [{ "field": "hosts", "dir": "desc" }], "limit": 20 },
  "openBySeverity": { "from": "vulnerabilities", "groupBy": ["severity"], "aggregate": { "n": { "fn": "count" } },
                      "where": { "logic": "and", "items": [{ "field": "isOpen", "op": "eq", "value": "true" }] } },
  "topTech": { "from": "rollups", "select": ["key", "value"], "limit": 20,
               "where": { "logic": "and", "items": [{ "field": "metric", "op": "eq", "value": "technology" }] } } } }
```

Exposure checks:

```json
{ "queries": {
  "adminPanels": { "from": "services", "select": ["host.value", "port", "http.title"], "limit": 100,
                   "where": { "logic": "or", "items": [
                     { "field": "http.title", "op": "contains", "value": "admin" },
                     { "field": "http.title", "op": "contains", "value": "login" } ] } },
  "riskyPorts": { "from": "services", "select": ["host.value", "port", "http.title"], "limit": 200,
                  "where": { "logic": "and", "items": [{ "field": "port", "op": "in", "value": ["21", "23", "445", "3306", "3389", "5432", "6379", "9200", "27017"] }] } },
  "expiringTls": { "from": "tls", "select": ["host", "port", "notAfter", "issuerCn"],
                   "where": { "logic": "and", "items": [{ "field": "notAfter", "op": "lt", "value": "now+30d" }] },
                   "orderBy": [{ "field": "notAfter", "dir": "asc" }] },
  "inRange": { "from": "ips", "select": ["ip", "host.value"],
               "where": { "logic": "and", "items": [{ "field": "ip", "op": "inSubnet", "value": ["203.0.113.0/24"] }] } } } }
```

Who runs a technology, and which versions:

```json
{ "queries": {
  "nginx": { "from": "technologies", "select": ["name", "version", "service.host.value", "service.port"], "limit": 100,
             "where": { "logic": "and", "items": [{ "field": "name", "op": "eq", "value": "nginx" }] } },
  "versions": { "from": "technologies", "groupBy": ["name", "version"], "aggregate": { "services": { "fn": "count" } },
                "orderBy": [{ "field": "services", "dir": "desc" }], "limit": 50 } } }
```

Findings (then `investigate_vulnerability` with an `id` for the details):

```json
{ "queries": {
  "open": { "from": "vulnerabilities", "select": ["name", "severity", "cvssScore", "cve", "host.value", "detectionStatus"], "limit": 100,
            "where": { "logic": "and", "items": [
              { "field": "isOpen", "op": "eq", "value": "true" },
              { "field": "severity", "op": "in", "value": ["critical", "high"] } ] },
            "orderBy": [{ "field": "cvssScore", "dir": "desc" }] },
  "byCve": { "from": "vulnerabilities", "select": ["name", "host.value"],
             "where": { "logic": "and", "items": [{ "field": "cve", "op": "eq", "value": "CVE-2024-3400" }] } },
  "hostsWithCritical": { "from": "hosts", "select": ["value", "target.value"],
                         "where": { "logic": "and", "items": [{ "field": "vulnerabilities.severity", "op": "eq", "value": "critical" }] } } } }
```

Trends:

```json
{ "window": { "since": "now-30d" }, "queries": {
  "hostsPerDay": { "from": "hosts", "groupBy": [{ "field": "firstSeen", "bucket": "day" }], "aggregate": { "n": { "fn": "count" } }, "limit": 31 },
  "findingsPerWeek": { "from": "vulnerabilities", "groupBy": [{ "field": "firstSeen", "bucket": "week" }, "severity"], "aggregate": { "n": { "fn": "count" } }, "limit": 50 } } }
```

Every day of the last two weeks, empty days included, in the user's time zone:

```json
{ "window": { "since": "now-14d" }, "options": { "timezone": "Asia/Ho_Chi_Minh" }, "queries": {
  "newPortsPerDay": { "from": "services", "groupBy": [{ "field": "firstSeen", "bucket": "day" }], "aggregate": { "n": { "fn": "count" } }, "fill": true } } }
```

Hosts ranked by open findings, one row per host with a column per severity, only hosts with something critical or high:

```json
{ "queries": {
  "riskByHost": { "from": "vulnerabilities", "groupBy": ["host.value"], "limit": 50,
    "where": { "logic": "and", "items": [{ "field": "isOpen", "op": "eq", "value": "true" }] },
    "aggregate": {
      "open": { "fn": "count" },
      "critical": { "fn": "count", "where": { "logic": "and", "items": [{ "field": "severity", "op": "eq", "value": "critical" }] } },
      "high": { "fn": "count", "where": { "logic": "and", "items": [{ "field": "severity", "op": "eq", "value": "high" }] } },
      "maxCvss": { "fn": "max", "field": "cvssScore" } },
    "having": { "logic": "or", "items": [{ "field": "critical", "op": "gt", "value": "0" }, { "field": "high", "op": "gt", "value": "0" }] },
    "orderBy": [{ "field": "critical", "dir": "desc" }] } } }
```

Hosts by what they lack or have (relation tests, nesting, negation):

```json
{ "queries": {
  "webWithoutTls": { "from": "hosts", "select": ["value", "target.value"], "limit": 100,
    "where": { "logic": "and", "items": [
      { "relation": "services", "where": { "logic": "and", "items": [{ "field": "port", "op": "in", "value": ["80", "8080"] }] } },
      { "relation": "services", "quantifier": "none", "where": { "logic": "and", "items": [{ "field": "port", "op": "eq", "value": "443" }] } } ] } },
  "manyPorts": { "from": "hosts", "select": ["value"], "limit": 100,
    "where": { "logic": "and", "items": [{ "relation": "services", "count": { "op": "gte", "value": "10" } }] } },
  "notInternal": { "from": "hosts", "select": ["value", "lastSeen"], "limit": 100,
    "where": { "logic": "and", "items": [
      { "not": { "logic": "or", "items": [
        { "field": "value", "op": "endsWith", "value": ".internal" },
        { "field": "value", "op": "startsWith", "value": "dev-" } ] } },
      { "field": "lastSeen", "op": "isNotNull" } ] } } } }
```
