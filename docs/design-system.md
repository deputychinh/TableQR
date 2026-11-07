# Design system — patterns every screen reuses

Owner rule (2026-11-08): "giao diện dễ dùng, có pattern và thân thiện". A screen is built from the patterns below; a new pattern needs a line here first.

## Principles

1. **One obvious next action per screen** — a single primary button, placed where the thumb reaches (bottom bar on phones, right column on iPad).
2. **Recognition over recall** — dishes and statuses show with icon + colour + word; nothing relies on colour alone.
3. **Forgiving** — destructive or money actions confirm in a sheet with the consequence spelled out; everything else is undoable or editable.
4. **Same words everywhere** — status names come from one locale table (Chờ xác nhận, Đang chờ, Đang nấu, Xong, Đã ra bàn, Đã huỷ, Đã thanh toán).
5. **Big and calm** — body 16 px+ (kitchen 20 px+), targets ≥ 44 px (kitchen ≥ 56 px), generous spacing, no dense tables on phones.

## Tokens

`web/src/styles/tokens.css`: primitive → semantic colours (light/dark), spacing scale `--space-1…5`, radius, type sizes, `--target-min`. Components use semantic tokens only (Stylelint forbids hex outside tokens).

## Layout by role and window size

| Role             | Device                    | Shell                                                                                            |
| ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| Guest            | phone (compact)           | top bar (restaurant, table), content, sticky bottom action bar (Giỏ hàng / Gửi món / Thanh toán) |
| Kitchen          | iPad landscape (expanded) | station tabs on top, queue as large cards in columns by status, no scrolling header              |
| Waiter / cashier | iPad or phone             | bottom navigation on compact, navigation rail on medium/expanded; list → detail                  |
| Owner            | iPad or laptop            | navigation rail + content; forms in one column max 40 rem                                        |

## Components (one each, reused)

| Component                                     | Use                                                                                  | States                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `AppShell`                                    | header + nav per role                                                                | —                                                         |
| `BaseButton`                                  | primary / secondary / danger / ghost, sizes md / lg                                  | default, hover, focus-visible, pressed, disabled, loading |
| `FormField`                                   | label above input, hint, error below, `aria-describedby`                             | empty, filled, error, disabled                            |
| `StatusChip`                                  | dish / order / bill / booking status                                                 | one per status, icon + word                               |
| `ListItem` / `CardItem`                       | menu items, queue tickets, tables                                                    | default, selected, late (warning)                         |
| `ConfirmSheet`                                | money and destructive actions                                                        | open, busy                                                |
| `EmptyState`                                  | no data yet — says why and offers the next action                                    | —                                                         |
| `ErrorState`                                  | load failed — plain cause + "Thử lại"                                                | —                                                         |
| `LoadingState`                                | skeleton rows, never a blank screen                                                  | —                                                         |
| `Toast`                                       | outcome of an action, polite live region, queued                                     | success, error                                            |
| `BaseSheet`                                   | forms over a list: bottom sheet on phones, dialog on iPad                            | open (focus on first field, Escape closes)                |
| `ToggleSwitch`                                | on/off with a visible state word (e.g. Còn món / Hết món)                            | on, off, disabled                                         |
| `SelectField`, `TextAreaField`, `NumberField` | same anatomy as `FormField`; `NumberField` opens the numeric keypad and shows a unit | empty, filled, error                                      |

Every data view shows loading / empty / error / success. Screens are checked at 390 px (iPhone), 820 px (iPad portrait) and 1180 px (iPad landscape) with screenshots in review.
