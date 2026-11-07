# Testing

## Layers

| Layer                                                     | Where                             | Run                                 | Threshold                            |
| --------------------------------------------------------- | --------------------------------- | ----------------------------------- | ------------------------------------ |
| Domain (pure logic)                                       | `services/api/src/**/*.spec.ts`   | `make test`                         | part of ≥ 90 %                       |
| API (HTTP layer, real database, fakes for external ports) | `services/api/test/*.e2e-spec.ts` | `make e2e`                          | as above                             |
| Web unit/component                                        | `web/src/**/*.test.ts`            | `make test`                         | lines ≥ 80 %                         |
| Browser journeys                                          | `web/e2e` (Playwright)            | `make e2e` after a production build | smoke + the main journey per feature |
| Accessibility                                             | `web/e2e/a11y.spec.ts` (axe-core) | `make e2e`                          | serious/critical = 0                 |

`make ci` = lint + typecheck + test; identical to `.github/workflows/ci.yml`.

## Principles

- Test behaviour, one behaviour per test, Arrange–Act–Assert; names are sentences (`order is rejected when stock is zero`).
- Fakes for ports (DB, clock, external APIs) in one place per service (`tests/fakes.py`, `test/fakes.ts`); no network in tests; warnings are errors.
- Real fixtures from the repo (`content/`), never datasets or models.
- E2E runs against the production build, never the dev server.

## What the tests do not prove

- Real phones on shop Wi-Fi, printed QR legibility and real bank apps scanning the VietQR code are checked by hand in the demo, not by CI.
