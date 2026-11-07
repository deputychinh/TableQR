# Plan

Each phase ends with `make ci` green, docs updated and commits on `main`.

| Phase | Goal                                                                | Acceptance                                                                         |
| ----- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 0     | Bootstrap (this skill)                                              | `make ci` green, commitlint rejects a bad message, README/CHANGELOG/ADR 0001 exist |
| 1     | Walking skeleton: one end-to-end slice (API `/health` → web status) | e2e smoke passes against the production build                                      |
| 2     | …                                                                   | …                                                                                  |
