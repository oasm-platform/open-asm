# i18n-dictionary module

Read-only dictionary endpoint the console fetches at bootstrap. No writes, no auth.

## Layout

- `i18n-dictionary.controller.ts`: HTTP routes.
- `i18n-dictionary.module.ts`: registers the controller; imported by `app.module.ts`.

## Public surface

All routes `@Public()` (no session needed — the console needs labels before login).

| Route | Behaviour |
|---|---|
| `GET i18n/languages` | supported language codes from `I18nService.getSupportedLanguages()` |
| `GET i18n/:lang` | merged namespaces from `I18nService.getTranslations()` (same memory the API translates with); unknown code → 404; `Cache-Control: public, max-age=3600` |

## Data model

None. Reads translations already loaded by `nestjs-i18n`; never reads JSON files from disk (so `lang` can never become a path traversal).

## Invariants

- New language = new `src/i18n/<lang>/` folder only. No code change here: supported codes come from the loader, not a whitelist.
- No `routers` pseudo-language: URLs are built by `notification-link.ts`, not served here.

## Coupling

- Injects `I18nService` (global via `I18nModule`). Imported only by `app.module.ts`.

## Testing

`i18n-dictionary.controller.spec.ts`.
