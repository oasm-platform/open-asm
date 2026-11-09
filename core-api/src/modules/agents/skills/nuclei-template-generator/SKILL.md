---
name: nuclei-template-generator
description: Write a valid Nuclei template (YAML) from a description of what to detect, then save it as a custom template of the workspace (Settings → Templates). Use when the user asks to generate, write, convert or fix a Nuclei template or a custom scan template.
---

# Nuclei Template Generator

Turn the user's description ("detect exposed .git folders", "check CVE-2024-XXXX on Confluence") into one Nuclei v3 template that parses, runs, and reports only real hits.

## Workflow

1. **Read the request.** Work out the protocol (HTTP, DNS or raw TCP), what to send, and what in the response proves the finding. If one of those is missing and you cannot infer it, ask one short question. Otherwise assume, and list your assumptions under the template.
2. **Research only when needed.** For a named CVE or product issue, load the `web-research` skill and fetch the advisory or a public PoC for the exact path, parameter, version and response marker. Never invent a CVE id, path or marker; if you could not confirm one, say so.
3. **Write the template** following the rules below.
4. **Check it** against the checklist at the end before showing it.
5. **Show and save it.** Put the full YAML in a ```yaml block in your reply, then save it with `save_template` (see Saving).

## Skeleton

```yaml
id: exposed-git-config

info:
  name: Exposed Git Config
  author: oasm-ai
  severity: medium
  description: |
    The .git/config file is publicly readable, which can leak repository URLs and credentials.
  reference:
    - https://example.com/advisory
  tags: exposure,git,config
  # Only when known:
  # classification:
  #   cve-id: CVE-2024-12345
  #   cwe-id: CWE-200
  # metadata:
  #   max-request: 1

http:
  - method: GET
    path:
      - "{{BaseURL}}/.git/config"

    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "[core]"
          - "repositoryformatversion"
        condition: and

      - type: status
        status:
          - 200
```

## Field rules

- **`id`**: required, lowercase letters, digits and hyphens only (`^[a-z0-9][a-z0-9-]*$`), no spaces. For a CVE use the CVE id (`CVE-2024-12345`, the one place uppercase is customary). The file name is `<id>.yaml`.
- **`info.name`** and **`info.author`**: required. Author is `oasm-ai` unless the user gives a name.
- **`info.severity`**: one of `info`, `low`, `medium`, `high`, `critical`, `unknown`. Detection or fingerprint templates are `info`.
- **`info.description`**: what is detected and why it matters, one to three sentences.
- **`info.tags`**: one comma-separated string (`cve,cve2024,rce,apache`), lowercase.
- **`info.reference`**: list of URLs you actually used. Leave it out rather than invent links.
- **`info.classification`** (`cve-id`, `cwe-id`, `cvss-metrics`, `cvss-score`) only with confirmed values.

## Protocol blocks

Use exactly one protocol block unless the check truly needs more.

### `http`

Use `http:` (`requests:` is the deprecated name).

- Simple form: `method` + `path` list. Paths start with `{{BaseURL}}` (the full input URL, path kept) or `{{RootURL}}` (scheme + host + port only). Never hard-code a host.
- Raw form for full control of headers or body:
  ```yaml
  http:
    - raw:
        - |
          POST /api/login HTTP/1.1
          Host: {{Hostname}}
          Content-Type: application/json

          {"username":"admin","password":"admin"}
  ```
  Raw requests use `{{Hostname}}` (host:port) in the `Host` header.
- Optional: `headers:`, `body:`, `redirects: true` + `max-redirects: 3`, `stop-at-first-match: true` when several paths probe for the same thing.
- Payloads: `payloads:` with `attack: batteringram|pitchfork|clusterbomb`, referenced as `{{name}}`. Keep lists short; this is a detection template, not a brute-forcer.

### `dns`

```yaml
dns:
  - name: "{{FQDN}}"
    type: CNAME
    matchers:
      - type: word
        words:
          - "herokuapp.com"
```

`type` is one of `A`, `NS`, `CNAME`, `SOA`, `PTR`, `MX`, `TXT`, `AAAA`, `CAA`, `TLSA`, `ANY`, `SRV`. Use `{{FQDN}}` for the input domain.

### Raw TCP (`tcp`, formerly `network`)

```yaml
tcp:
  - host:
      - "{{Hostname}}"
    port: 6379
    inputs:
      - data: "INFO\r\n"
    read-size: 2048
    matchers:
      - type: word
        words:
          - "redis_version"
```

`network:` is the older name of the same block and still parses; prefer `tcp:`. `inputs[].type: hex` sends hex-encoded bytes.

## Matchers

- `type`: `word`, `regex`, `status`, `size`, `binary`, `dsl`, `xpath`.
- `part`: `body` (default for HTTP), `header`, `all`, `raw`; for DNS and TCP leave it out.
- `condition: and|or` combines the values inside one matcher; `matchers-condition: and|or` on the request combines the matchers.
- `negative: true` inverts a matcher (e.g. "not a login page"). `case-insensitive: true` for words.
- `dsl` examples: `status_code == 200 && contains(body, "admin")`, `len(body) > 100`, `compare_versions(version, '< 2.4.50')`.
- **Avoid false positives**: always pair a weak signal (status 200) with a specific body or header marker that only the vulnerable or exposed thing returns. Never match on status alone, on a generic word like "error", or on text that a default 404 or WAF page also contains.

## Extractors

Use extractors to report a value (version, token, hostname), not to decide a match.

```yaml
    extractors:
      - type: regex
        part: body
        group: 1
        regex:
          - 'Apache/([0-9.]+)'
```

`type`: `regex`, `kval` (header names, `-` written as `_`), `json` (jq syntax, e.g. `.version`), `xpath`, `dsl`. Add `internal: true` and a `name` when the value only feeds a later request as `{{name}}`.

## Variables

Built-in: `{{BaseURL}}`, `{{RootURL}}`, `{{Hostname}}`, `{{Host}}`, `{{Port}}`, `{{Path}}`, `{{Scheme}}`, `{{FQDN}}`, `{{randstr}}`. Own values go under a top-level `variables:` map. Helpers such as `{{base64(...)}}`, `{{url_encode(...)}}`, `{{to_lower(...)}}` work inside requests.

## Checklist before showing the template

- Top-level keys are only `id`, `info`, optional `variables`, and the protocol block(s); indentation is two spaces, no tabs.
- `id`, `info.name`, `info.author`, `info.severity` are present; severity is one of the allowed values.
- Every request has at least one matcher, and the matchers cannot fire on an unrelated page.
- No hard-coded target host; no destructive request (no writes, deletes or account changes) unless the user explicitly asked for it and you said so.
- Strings with `{{`, `:`, `#` or leading special characters are quoted.

## Saving

Always save the template with `save_template`. It stores it as a custom template of the workspace (**Settings → Templates**, the `custom-templates` folder), where the user can edit it and run it against targets, assets or projects. Do not use `save_file` for templates: a file there cannot be run as a template.

```
save_template({ fileName: "<id>.yaml", content: "<the YAML>" })
```

- The server validates the template: the name must end in `.yaml` or `.yml`, the YAML must parse and have a string `id`, at most 256 KB. On a validation error, fix the reported line and call `save_template` again.
- To change a template you already saved in this chat, pass its `templateId` from the earlier result so it is overwritten instead of duplicated.
- After saving, tell the user the template name and that it is under Settings → Templates.
- If `save_template` reports that the user lacks permission, do not retry: the YAML in your reply is the deliverable.
