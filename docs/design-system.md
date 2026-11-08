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

What exists in `web/src/components/` (shells in `web/src/app/layouts/`). A screen uses these before inventing anything.

| Component                                     | Use                                                                                                                                                         | States                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `OwnerShell`                                  | owner area (and floor staff on pages open to them): header, navigation built from the routes' `meta.roles` (only pages the role can open), toast region     | bottom bar on compact, rail from 840 px                                 |
| `StaffShell`                                  | cashier, waiter, kitchen and platform-admin screens: header with title, restaurant, links to shared pages the role can open (e.g. "Bàn & QR"), toast region | —                                                                       |
| `AuthLayout`                                  | sign-in and sign-up                                                                                                                                         | —                                                                       |
| `BaseButton`                                  | primary / secondary / danger / ghost, sizes md / lg, `block`                                                                                                | default, hover, focus-visible, pressed, disabled, loading               |
| `IconButton`                                  | an action shown as an icon only (move, edit, delete, close); `label` is required and names the target ("Sửa món Phở bò")                                    | default, hover, focus-visible, pressed, disabled; tone neutral / danger |
| `FormField`                                   | label above input, hint, error below, `aria-describedby`                                                                                                    | empty, filled, error, disabled                                          |
| `TextAreaField`, `SelectField`, `NumberField` | same anatomy as `FormField`; `NumberField` opens the numeric keypad and shows a unit                                                                        | empty, filled, error                                                    |
| `NumberStepper`                               | small whole numbers with large − / + buttons (seats, minutes)                                                                                               | min, max, disabled                                                      |
| `RadioCardGroup`                              | one choice among a few, each with an explanation (house rules, roles)                                                                                       | selected, focus-visible                                                 |
| `ToggleSwitch`                                | on/off with a visible state word (e.g. Còn món / Hết món)                                                                                                   | on, off, disabled                                                       |
| `StatusChip`                                  | dish / order / bill / booking / role status: word + optional icon                                                                                           | one tone per status, never colour alone                                 |
| `BaseSheet`                                   | forms over a list: bottom sheet on phones, dialog on iPad (native `<dialog>`)                                                                               | open (Escape or backdrop closes), actions slot                          |
| `ConfirmSheet`                                | money and destructive actions, consequence spelled out                                                                                                      | open, busy                                                              |
| `FormAlert`                                   | one error for a whole form or sheet (`role="alert"`)                                                                                                        | —                                                                       |
| `EmptyState`                                  | no data yet — says why and offers the next action                                                                                                           | —                                                                       |
| `ErrorState`                                  | load failed — plain cause + "Thử lại"                                                                                                                       | —                                                                       |
| `LoadingState`                                | skeleton rows, never a blank screen                                                                                                                         | —                                                                       |
| `Toast` (`ToastRegion` + `useToastStore`)     | outcome of an action; one polite live region per shell, messages queued and shown one at a time                                                             | success, error; close button                                            |
| `BrandMark`                                   | product mark in shells                                                                                                                                      | —                                                                       |

Planned, not built yet (add here when they arrive): `ListItem` / `CardItem` for menu items, queue tickets and tables (today each feature has its own card: `TableCard`, `MenuItemRow`).

Every data view shows loading / empty / error / success. Screens are checked at 390 px (iPhone), 820 px (iPad portrait) and 1180 px (iPad landscape) with screenshots in review.
