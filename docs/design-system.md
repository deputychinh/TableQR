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
| Kitchen          | iPad landscape (expanded) | `StaffShell` without navigation; station tabs with waiting counts on top, queue in two columns   |
| Waiter / cashier | iPad or phone             | `StaffShell`: bottom navigation on compact, navigation rail from 840 px                          |
| Owner            | iPad or laptop            | `OwnerShell` on every page, floor screens included; rail + content; forms one column max 40 rem  |

### Shell per role (r2 review)

One shell per role, chosen in one place: a staff page wraps its content in `RoleShell` (`web/src/app/layouts/RoleShell.vue`), which gives the owner `OwnerShell` and everyone else `StaffShell` titled with the page's `title`. A page never picks a shell itself. Both shells are the same frame (`ShellFrame`): header (brand, screen title or restaurant name — a long name ends in "…", sign-out), the role's navigation, the scrolling content and the toast region. Nothing scrolls sideways at 390 px (every Playwright journey on the iPhone project asserts it through `e2e/support/fixtures.ts`).

Navigation comes from one table, `web/src/app/layouts/navigation.ts` (`ROLE_NAV`), filtered by the routes' `meta.roles`:

| Role           | Bottom bar on phones (Material 3: at most 5)         | Rail from 840 px                     |
| -------------- | ---------------------------------------------------- | ------------------------------------ |
| Owner          | Tổng quan · Thực đơn · Bàn & QR · Đặt bàn · **Thêm** | all of them, then a "Vận hành" group |
| Waiter         | Phục vụ · Duyệt đơn · Bàn & QR · Đặt bàn             | same                                 |
| Cashier        | Thu ngân · Bàn & QR · Đặt bàn                        | same                                 |
| Kitchen, admin | none (one screen each)                               | none                                 |

"Thêm" opens a sheet ("Các trang khác") with the owner's other pages in two groups: Quản lý (Nhân viên, Cài đặt) and Vận hành (Thu ngân, Bếp, Phục vụ, Duyệt đơn); the "Thêm" tab lights up while one of them is open. The owner overview also links to Thu ngân, Bếp and Phục vụ as cards.

### Sheets and their buttons

`BaseSheet` keeps its title and buttons fixed and scrolls only the body, so actions such as "Xoá món" are always on screen on a phone. The cancel button of every sheet reads **"Huỷ"**; **"Đóng"** only where the sheet changes nothing (an explanation, the "Thêm" sheet, a refusal such as "Không xoá được Bàn 1"). A refused destructive action keeps its sheet open, says why in plain words and offers the safe alternative as its primary button ("Ẩn bàn" for a table with history, TQR-024; "Ngừng bán" a dish). Hidden items sit in a collapsed section at the end of their list ("Bàn đã ẩn (n)", a disclosure button with `aria-expanded`) with an "Đã ẩn" chip and a "Hiện lại" button.

## Components (one each, reused)

What exists in `web/src/components/` (shells in `web/src/app/layouts/`). A screen uses these before inventing anything.

| Component                                     | Use                                                                                                                                                        | States                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `RoleShell`                                   | the only shell a staff page uses: `OwnerShell` for the owner, `StaffShell` (with `title`) for everyone else                                                | —                                                                       |
| `OwnerShell`                                  | the owner on every page: header with the restaurant name (ellipsis), navigation from `ROLE_NAV.owner`, toast region                                        | bottom bar (4 + "Thêm") on compact, rail with "Vận hành" from 840 px    |
| `StaffShell`                                  | cashier, waiter, kitchen and platform admin: header with the screen title and restaurant, the role's navigation (none for kitchen and admin), toast region | bottom bar on compact, rail from 840 px                                 |
| `AuthLayout`                                  | sign-in and sign-up                                                                                                                                        | —                                                                       |
| `BaseButton`                                  | primary / secondary / danger / ghost, sizes md / lg, `block`                                                                                               | default, hover, focus-visible, pressed, disabled, loading               |
| `IconButton`                                  | an action shown as an icon only (move, edit, delete, close); `label` is required and names the target ("Sửa món Phở bò")                                   | default, hover, focus-visible, pressed, disabled; tone neutral / danger |
| `FormField`                                   | label above input, hint, error below, `aria-describedby`                                                                                                   | empty, filled, error, disabled                                          |
| `TextAreaField`, `SelectField`, `NumberField` | same anatomy as `FormField`; `NumberField` opens the numeric keypad and shows a unit                                                                       | empty, filled, error                                                    |
| `DateField` (booking feature)                 | the native date picker with `FormField` anatomy (label above, hint and error below)                                                                        | empty, filled, error                                                    |
| `NumberStepper`                               | small whole numbers with large − / + buttons (seats, minutes)                                                                                              | min, max, disabled                                                      |
| `RadioCardGroup`                              | one choice among a few, each with an explanation (house rules, roles)                                                                                      | selected, focus-visible                                                 |
| `ToggleSwitch`                                | on/off with a visible state word (e.g. Còn món / Hết món)                                                                                                  | on, off, disabled                                                       |
| `StatusChip`                                  | dish / order / bill / booking / role status: word + optional icon                                                                                          | one tone per status, never colour alone                                 |
| `BaseSheet`                                   | forms over a list: bottom sheet on phones, dialog on iPad (native `<dialog>`)                                                                              | open (Escape or backdrop closes), actions slot                          |
| `ConfirmSheet`                                | money and destructive actions, consequence spelled out                                                                                                     | open, busy                                                              |
| `FormAlert`                                   | one error for a whole form or sheet (`role="alert"`)                                                                                                       | —                                                                       |
| `EmptyState`                                  | no data yet — says why and offers the next action                                                                                                          | —                                                                       |
| `ErrorState`                                  | load failed — plain cause + "Thử lại"                                                                                                                      | —                                                                       |
| `LoadingState`                                | skeleton rows, never a blank screen                                                                                                                        | —                                                                       |
| `Toast` (`ToastRegion` + `useToastStore`)     | outcome of an action; one polite live region per shell, messages queued and shown one at a time                                                            | success, error; close button                                            |
| `BrandMark`                                   | product mark in shells                                                                                                                                     | —                                                                       |

### Voice toggle (kitchen, TQR-027)

A screen that talks has one switch, `VoiceBar` (`web/src/features/kitchen/components/`), above the station tabs: a 56 px pill, `role="switch"` named **"Bật đọc to"** (the name never changes), icon (loudspeaker / muted) + state word ("Đang bật" / "Đang tắt") + colour, and a one-line hint saying what it does. Turning it on speaks right away ("Đã bật đọc to") because iOS plays audio only inside a tap. While it is on, two rows of 56 px choices follow — "Tốc độ đọc" (Chậm / Vừa / Nhanh) and "Âm lượng" (Nhỏ / Vừa / To) — as native radios in a fieldset with a legend. The choice is remembered per device (`localStorage`, never required). A browser that cannot speak shows the switch disabled and says why. Spoken sentences are short, table first ("Bàn 1: hai phở bò, một trà đá"), one at a time.

Planned, not built yet (add here when they arrive): `ListItem` / `CardItem` for menu items, queue tickets and tables (today each feature has its own card: `TableCard`, `MenuItemRow`).

Every data view shows loading / empty / error / success. Screens are checked at 390 px (iPhone), 820 px (iPad portrait) and 1180 px (iPad landscape) with screenshots in review.
