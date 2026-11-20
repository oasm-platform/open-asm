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
- Every `src/i18n/<lang>/` mirrors `en/` key for key; `i18n.layout.spec.ts` fails on a missing or extra key. Plurals: backend namespaces use ICU (`{count, plural, ...}`); `ui` keys the console reads use `<key>.one|few|many|other` siblings, picked by `Intl.PluralRules` in `console/src/lib/i18n-dictionary.ts` (`.other` is required).
- Console text lives here too: one namespace file per console area (`common`, `ui`, `shell`, `components`, and one per page group such as `assets`, `targets`, `agents`). `notification` and `validation` are backend-only. `console/src/lib/i18n-keys.test.ts` fails when the console uses a literal `t('ns.key')` that is missing from `en/`.
- The console sends the chosen language as `Accept-Language` (`console/src/utils/languageState.ts`), so notifications and validation errors come back in it.

## Coupling

- Injects `I18nService` (global via `I18nModule`). Imported only by `app.module.ts`.

## Testing

`i18n-dictionary.controller.spec.ts`.
