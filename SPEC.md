# Tally — v1 specification

Defined on 2 November 2026, and updated the same day to bring deployment into v1. Every point below is decided. Where I chose a default without asking you, it's listed under [Decisions I made for you](#decisions-i-made-for-you), so you can overrule it before the build starts.

## 1. Summary

Tally is a shared-expense tracker for small groups: a trip, a shared flat, a group project. One person creates a group and shares a link; everyone else taps it and is in. There are no accounts, no app store and no passwords. Expenses save instantly on the phone, even offline, and merge across everyone's phones when they reconnect. "Settle up" shows the fewest payments that clear every debt.

- **Who it's for:** the public, used in groups of 2–15 people (up to 50 supported).
- **Where it runs:** the web, as an installable progressive web app (PWA). One build covers phones, tablets and laptops.
- **Where data lives:** on each device first. A small relay keeps an end-to-end encrypted copy of each group's change log, so members who are never online at the same time still sync. The relay can't read any of it.
- **Deployment:** live in v1 at a free Cloudflare address, `tally.nhatt.workers.dev`. Every push to `main` that passes CI deploys automatically, starting at milestone 1.

## 2. Decisions

### Decided with you

| Topic | Decision |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | CSS Modules, with design tokens as CSS custom properties |
| Visual design | Designed by me: mobile-first, system fonts, light and dark themes |
| Sync | Custom event log: immutable operations, hybrid logical clocks, last writer wins per field |
| Relay | Cloudflare Worker, plus one Durable Object (SQLite) per group, over WebSockets |
| Privacy | End-to-end encrypted; the key lives in the link's `#fragment` |
| Split modes | Equal (everyone or a subset), exact amounts, shares, percentages |
| Payments | "Mark as paid" on suggested transfers, plus manual payments, including partial ones |
| Permissions | Anyone in the group can edit anything. Every change is attributed in an activity feed, and deleted items can be restored |
| Languages | English and Vietnamese |
| v1 extras | Categories, join by QR code, CSV export, search and filters |
| Analytics | None |
| Deployment | Live in v1 at `tally.nhatt.workers.dev`, from milestone 1 |
| Workflow | Push straight to `main` at the end of each milestone; every push that passes CI deploys to production |
| Repository | Public at [nhatnguyen1873/tally](https://github.com/nhatnguyen1873/tally), MIT license (already committed), `master` renamed to `main`, CI on GitHub Actions |
| Push access | GitHub CLI signed in as nhatnguyen1873 and used by this repo only; your work SSH setup is untouched |
| Commits | No co-author trailers |
| Relay retention | A group nobody opens for 12 months is deleted from the relay. Any device that still has it re-uploads it when reopened |
| Process | Milestones with a check-in after each (section 14) |

### Decisions I made for you

1. **Package manager:** pnpm (already installed here).
2. **Rounding:** splits use the largest-remainder method on integer minor units (đồng, cents). Leftover units go to participants in an order derived from the expense ID, so nobody systematically pays the extra đồng across many expenses.
3. **Amounts:** greater than 0 and at most 100,000,000,000 minor units per expense or payment. Amounts are exact; VND isn't rounded to 1,000₫.
4. **Currency:** chosen at creation; it can be changed only while the group has no expenses or payments.
5. **Payers:** one payer per expense. Multiple payers, notes and amount shorthand ("120k") come later.
6. **Members:** can be added or renamed at any time, and removed only if they're in no expense or payment and at least two people would remain.
7. **Concurrent edits:** the last writer wins per field, but amount, payer and split change together as one unit, so a split always matches its amount. A deleted item stays deleted unless someone restores it.
8. **Connection needs:** the first open of a group needs a connection to download it; everything after that works offline. A group created offline uploads when its creator reconnects.
9. **Address bar:** after joining, the secret is removed from the address bar. The Share button always produces the full invite link.
10. **Deleting data:** v1 has no "delete for everyone", only "Remove from this device".
11. **Relay limits:** 4 KB per operation, 100 operations per message, 20,000 operations and 50 open connections per group, and 120 operations per minute per connection.
12. **Browsers:** the current and previous major versions of Chrome, Edge, Firefox and Samsung Internet, plus Safari and iOS 16.4 or later.
13. **Libraries:** wouter (routing), idb (IndexedDB), Lucide's icon data (drawn by a small component, a few dozen bytes per icon), uqr (QR codes), a small hand-written service worker (vite-plugin-pwa lists and stamps the files during `vite build`, before the prerender step rewrites `index.html`), @cloudflare/vite-plugin (runs the Worker during development), React Compiler, and a small typed i18n layer instead of a large library.
14. **Vietnamese copy:** I write it, and you review it at milestone 2.
15. **Phone testing:** check-ins happen on the live address. Service workers and WebCrypto need HTTPS, so trying unpushed work on a phone goes through a free Cloudflare quick tunnel (it needs `cloudflared`, but no account).
16. **Commit identity:** Nhat Nguyen <nhatnguyen1873@gmail.com>, matching your first commit and set for this repo only. Your global git config, which has your work email, stays as it is.
17. **Commit style:** small, focused commits with Conventional Commit messages (`feat:`, `fix:`, `test:` and so on).
18. **Environments:** production only, with no staging. Until v1 is tagged, the app shows a "Preview" label.
19. **Operations:** the deploy runs only after every check passes, and a smoke test of the live site follows it. Rollback is `wrangler rollback`. Details are in section 13.

## 3. Walkthrough

This walkthrough is also the main end-to-end test.

1. Open Tally and tap **New group**. Name it "Đà Lạt trip", pick VND, enter your name (Minh), and add An, Linh and Bảo.
2. The share sheet opens. Send the link to the group chat, or let people at the table scan the QR code.
3. Friends tap the link. Tally downloads the group and asks **"Who are you?"**, and each person picks their name.
4. Minh logs **"Dinner, 1,200,000₫, paid by Minh, split equally"** under Food. It saves instantly, even offline. Each person's list shows their part: An sees "You borrowed 300,000₫", and Minh sees "You lent 900,000₫".
5. Bảo, offline on the bus, logs "Taxi, 16,000₫" (missing a zero). When the phone reconnects, the taxi appears on every phone without a refresh.
6. An fixes the typo. The activity feed shows "An changed Taxi: 16,000₫ → 160,000₫".
7. Tap **Balances**. Settle up suggests three transfers: An pays Minh 340,000₫, Linh pays Minh 340,000₫, and Bảo pays Minh 180,000₫. After An sends the money, An taps **Mark as paid**, and balances update for everyone.
8. At the end of the trip, someone exports the group as a CSV file.

## 4. Screens

Inside a group, a bottom tab bar holds Expenses, Balances and Activity. The header shows the group name, sync status, Share and Settings.

| Screen | Route | Contents |
|---|---|---|
| Home | `/` | First visit: a one-line pitch, **New group**, and **Join with a link** (paste). Returning: your groups with "You're owed", "You owe" or "Settled up" and the last activity, sorted by last opened; language and theme switches; install hint; link to About |
| New group | `/new` | Group name, currency (a search box narrows the list by code or name; defaults to VND for Vietnamese, otherwise to the region's currency, falling back to USD), your name, and at least one other name |
| Join | `/g/:id#secret` | Downloads the group, then asks "Who are you?" with the member list and "I'm not on the list" (which adds you). A link missing its secret, or one opened offline for the first time, explains what to do |
| Expenses | `/g/:id` | Summary card (your balance, group total), search, filters behind a Filters toggle, and a list grouped by day. Each row shows the category icon, title, who paid and your part. Payments appear in the list |
| Expense form | `/g/:id/e/new`, `/g/:id/e/:eid` | Amount (formatted as you type), title, category, paid by, date, and split mode with a row per person and a live "left to assign". In edit mode: Delete (with Undo) and this expense's change history |
| Payment form | `/g/:id/pay/new`, `/g/:id/pay/:pid` | From, to, amount and date, prefilled when opened from a suggestion. In edit mode: Delete (with Undo) |
| Balances | `/g/:id/balances` | Each member's net balance (in words and signs, never color alone) with paid and share totals, the **Settle up** list with "Mark as paid" and "Other amount", and spending by category |
| Activity | `/g/:id/activity` | Every change, newest first, attributed, with Restore on a deletion that is still that item's latest change. The tab shows an unread dot |
| Group settings | `/g/:id/settings` | Group name, currency (locked once used), members (add, rename, remove), "You are Minh · Switch", invite (link, QR code, Share), Export CSV, app language and theme, and "Remove from this device", which warns about changes that haven't synced yet |
| Share sheet | (dialog) | QR code, Copy link, and Share where the browser supports it, with a reminder that anyone with the link can see and edit the group |
| About | `/about` | How the encryption works, exactly what the relay can see and how long it keeps it, no analytics, and links to the source code and to report a problem (GitHub issues) |

App-wide: Undo toasts, a "New version ready · Reload" toast, an install prompt (Android) or Add to Home Screen instructions (iOS), and an "Open in your browser" hint inside in-app browsers (Zalo, Messenger, Facebook, Instagram), where storage is separate and installing isn't possible.

## 5. Domain rules

### 5.1 Groups and members

- **Group:** name (1–60 characters) and currency. The currency is stored as an ISO 4217 code plus its number of minor digits, so every device reads amounts the same way. It can change only while the group has no expenses or payments. A change that lands after one in the log (possible offline) is ignored.
- **Members:** name (1–30 characters, unique within the group, ignoring case); 2–50 per group. Removed members don't count toward the 50, and bringing one back needs a free place. Settings offers removing someone only while at least two people would remain; as with removing someone who's in an expense, removals made offline at the same time can still leave fewer.
- **Identity:** each device picks "who am I" per group, and the choice is stored only on that device. You must pick before adding anything. Several devices can act as the same person. If your member is removed, Tally asks again.
- **Duplicate names:** if two people add the same name while offline, both appear (the second as "An (2)"), and the unused one can be removed.
- **Removed but involved:** a removed member who still appears in an expense (possible after concurrent offline edits) stays in balances, is labeled "removed", and can be restored.

### 5.2 Expenses and payments

- **Expense:** title (1–80 characters), amount, paid by (one member), date (a calendar date, default today), category and split.
- **Payment:** from, to (two different members), amount and date.
- **Categories** (an icon each; "Other" is the default):

  | English | Vietnamese |
  |---|---|
  | Food & drink | Ăn uống |
  | Groceries | Đi chợ |
  | Transport | Di chuyển |
  | Accommodation | Chỗ ở |
  | Activities | Vui chơi |
  | Shopping | Mua sắm |
  | Bills | Hóa đơn |
  | Other | Khác |

### 5.3 Money

- **Integers only:** all amounts are integers in the currency's minor unit (VND: đồng, 0 digits; USD: cents, 2 digits). Money math never uses floating point, and allocation uses BigInt for intermediate products.
- **Equal:** among any non-empty subset of members.
- **Exact:** amounts per person that must sum to the total.
- **Shares:** a positive whole-number weight from 1 to 99 per person.
- **Percentages:** up to two decimals per person, stored as basis points, and they must total exactly 100%.
- **Allocation** (equal, shares and percentages): each person gets floor(amount × weight ÷ total weight). The leftover units, always fewer than the number of people, go to the largest fractional remainders, with ties broken by a hash of the expense ID and member ID. Every split sums exactly to its amount.

### 5.4 Balances and settle-up

- **Net balance:** what you paid (expenses you paid for, plus payments you sent) minus your share (your split portions, plus payments you received). The nets of a group always sum to exactly zero.
- **Fewest transfers:** settle-up splits the non-zero balances into as many zero-sum subgroups as possible, then settles each subgroup by pairing the largest debtor with the largest creditor. The search is exact (a bitmask search) for up to 18 people with non-zero balances and greedy beyond that. Ties break by member order, so every phone shows identical suggestions.
- **Simplified debts:** because transfers are minimized, someone may be asked to pay a person they never shared an expense with.
- **Paying:** "Mark as paid" records a payment for the full suggested amount, with Undo. "Other amount" opens the payment form prefilled.

### 5.5 Search, filters and export

- **Search** matches an expense's title and who paid, and a payment's two people, ignoring case and Vietnamese diacritics: "pho" finds "Phở", and "da lat" finds "Đà Lạt".
- **Filters:** person (paid or involved), month, category and type (expenses or payments). Filters live in the URL, and each change is a step the Back button undoes (a search is one step, not one per letter). The summary shows the filtered total.
- **CSV export** is generated on the device, with one row per expense or payment. Columns are date, type, title, category, amount, currency, paid by or from, to, and one column per member's share. The file is UTF-8 with a byte-order mark so Excel shows Vietnamese correctly, and amounts are plain numbers.

## 6. Sync and data model

### 6.1 Operations

Every change is one immutable operation; state is never edited in place.

```ts
type Op = {
  v: 1
  id: string            // random and unique
  hlc: string           // hybrid logical clock, fixed width so it sorts as text
  actor: string         // random per device per group
  by: MemberId          // who the device says it is
  entity: 'group' | 'member' | 'expense' | 'payment'
  key: string           // the entity's ID
  set: Partial<Fields>  // the fields being set
}
```

Fields per entity:

- group: `name`, `currency` (`{ code, digits }`)
- member: `name`, `deleted`
- expense: `title`, `money` (`{ amount, paidBy, split }`), `date`, `category`, `deleted`
- payment: `money` (`{ amount, from, to }`), `date`, `deleted`

Creating an item sets all of its required fields, deleting it sets `deleted: true`, and restoring it sets `deleted: false`.

### 6.2 Merge rules

- **Same state everywhere:** every device sorts all operations by their clock and folds them in that order. Each field takes its value from the latest valid operation that set it. The same operations give the same state on every device, whatever order they arrived in.
- **Money stays consistent:** `money` is a single field, so concurrent edits can never leave a split that doesn't match its amount.
- **Validation:** any link holder can write, so the fold checks every operation (types, lengths, sums, member references, and a clock no later than the year 9999). Invalid operations are ignored but kept.
- **Activity feed:** the feed comes from the same fold. Each operation is compared with the state before it to produce "added", "changed amount from … to …", "deleted" or "restored".
- **Clocks:** hybrid logical clocks tolerate normal clock drift. The relay sends its time on connect, and the app warns when the device clock is more than 5 minutes off.

### 6.3 Encryption and links

- **Invite link:** `https://<host>/g/<groupId>#<secret>`. The group ID is 16 random bytes and the secret is 32 random bytes, both base64url-encoded. Browsers never send the part after `#` to servers.
- **Keys:** HKDF-SHA-256 derives two values from the secret: an AES-256-GCM encryption key and a separate access token for the relay.
- **Per operation:** each operation is encrypted with a fresh random 12-byte IV. The group ID and operation ID are bound as associated data, so ciphertext can't be moved to another group or replayed under another ID.
- **What the relay sees:** it stores only `{ seq, id, iv, ciphertext, receivedAt }` and a SHA-256 hash of the access token. It can see group IDs, operation sizes and timing, and IP addresses. It can't see names, amounts or anything else.
- **Hardening:** a strict Content-Security-Policy, no third-party scripts, and `Referrer-Policy: no-referrer`, because an injected script could read keys. The one inline script (it applies the theme and language before the first paint) is allowed by its hash, which the build computes, so no other inline script can run.

### 6.4 On the device

- **IndexedDB** holds each group (secret, chosen member, actor ID, clock state, sync cursor and epoch, last-read marker) and every operation in plaintext, marked pending or synced. Groups from before sync (milestone 2) upgrade in place as never uploaded. State is rebuilt by folding the log on open, which takes milliseconds for thousands of operations.
- **Persistent storage:** the app calls `navigator.storage.persist()` after the first group is created or joined.
- **Tabs:** several tabs can be open at once. They share IndexedDB and notify each other through BroadcastChannel.

### 6.5 Protocol

The protocol runs over a WebSocket at `/api/g/:groupId/ws`.

- **Connect:** the client sends `hello { token, after, create? }`. The relay checks the token hash, or registers it for a new group when `create` is set, replies `welcome { now, head, epoch }`, then streams the operations after the cursor in batches of 100. `epoch` is a random ID created along with the log. A device registers the group (`create`) when it has never reached the relay; a hello for a group nobody created stores nothing.
- **Push:** the client sends `push { ops }`. The relay appends them (deduplicating by ID), replies with `ack { acks: [{ id, seq }] }` (every pushed ID, including ones it already had) and broadcasts the new ones to the group's other connections. A device pushes up to 100 pending operations at a time, waiting for each `ack`.
- **Errors:** `unauthorized`, `not_found`, `too_large`, `rate_limited` (with `retryAfter` in milliseconds) and `group_full`, plus `bad_request` for a message the relay can't parse. `unauthorized`, `not_found` and `bad_request` close the connection. For someone joining, `not_found` means the group hasn't been uploaded yet, shown as "Ask whoever shared this link to open Tally while online".
- **Re-upload:** a device that already has the group treats `not_found` (the relay deleted it after a year idle) or a changed `epoch` as a fresh log. It registers the group again if needed, resets its cursor and uploads every operation it holds. The relay drops duplicates by ID, so several devices can do this at once.
- **Reconnecting:** pending operations are pushed on every connect. Reconnects back off exponentially with jitter (1 to 30 seconds), and retry immediately on the `online` event and when the app becomes visible. On the `offline` event the device drops its connection at once, rather than waiting for it to time out. The group on screen stays connected; any other group syncs until it's caught up with nothing to upload, then disconnects (Home catches every group up this way).
- **Sync status** shown to the user: Synced, Syncing, Offline (n changes waiting), or Can't reach server.

### 6.6 Relay

- **Worker:** one Cloudflare Worker serves the built app (static assets with a single-page fallback). It validates the group ID format, then routes `/api/g/:groupId/ws` to that group's Durable Object.
- **Durable Object:** keeps the log in its SQLite storage and uses the WebSocket Hibernation API, so idle groups cost nothing.
- **Retention:** every connection that presents the group's token moves its deletion alarm to 12 months out; one that doesn't (or one for a group nobody created) leaves it alone. When the alarm fires, the Durable Object deletes all of its storage.
- **Abuse limits:** the 50 connections per group count only devices that have sent a valid token; a connection that hasn't yet makes way for a new one, oldest first, so knowing a group's ID isn't enough to keep its devices out. Besides the per-group limits in section 2, Cloudflare's rate-limiting binding caps each IP address at 300 connections and 60 new groups a minute, per Cloudflare location. The caps are generous because many phones share an address behind mobile carriers' NAT.
- **Local development:** `@cloudflare/vite-plugin` runs the same Worker and Durable Object inside `vite dev`, so one command starts everything.

## 7. Offline and PWA

- **Service worker:** precaches the app shell and the code for every route, including the chunks that load on demand. Repeat visits work with no network, and so do CSV export and QR codes. The build lists the files after the HTML is final and stamps the version from their hashes. Page loads get the cached page; other files come from the cache, then the network; the relay is never touched.
- **Manifest:** includes icons (SVG, 192 and 512 px PNGs, and maskable versions) and an Apple touch icon. The theme-color tags give the light and dark bar colors.
- **Install:** on Android, an "Install" button on Home triggers the native prompt. On iOS, Home shows Share → Add to Home Screen instructions. Both go once installed or dismissed.
- **Updates:** a new service worker waits until the user taps "New version ready · Reload", which stays until tapped; every open tab then reloads into the new version. The app looks for a new version whenever it comes back to the foreground.
- **In-app browsers:** the "Open in your browser" hint sits with the toasts, so it never moves the page, and goes once dismissed for that visit.
- **iOS storage:** home-screen apps get storage separate from Safari, so the installed app offers "Join with a link". Safari may also clear data for sites not opened in 7 days. Installing avoids that, and the group re-downloads from the relay as long as you still have the link.

## 8. Languages

- **Choice:** English and Vietnamese, defaulting to the phone's language and switchable (System, English, Tiếng Việt).
- **Catalogs:** typed message catalogs. TypeScript enforces that `vi` defines every key in `en`. Each language is its own file: the page preloads the phone's language before the app starts, and the other loads on demand.
- **Formatting:** numbers, money and dates use `Intl` with the active language: "1.200.000 ₫" in Vietnamese and "₫1,200,000" in English. Relative times read "2 minutes ago" or "2 phút trước", and `<html lang>` follows the active language.

## 9. Accessibility (WCAG 2.2 AA)

- **Structure:** semantic HTML and landmarks. Each route change moves focus to the new heading and announces it.
- **Keyboard:** everything works by keyboard, with visible focus. Dialogs use the native `<dialog>`, trap focus, and return it on close.
- **Sizing and contrast:** touch targets of at least 44×44 px; contrast of 4.5:1 for text and 3:1 for controls, in both themes.
- **Not color alone:** balances use words and signs. The split editor announces "left to assign" politely.
- **User settings:** respects reduced motion, color scheme and the OS text size, and stays usable at 200% zoom (a test checks that no screen scrolls sideways at half the width).
- **Checks:** axe runs on every screen in both themes and languages, and CI fails on any violation. Every flow is also tested by keyboard alone. Screen readers need real phones, so before v1 you run the short VoiceOver and TalkBack checklist in [docs/screen-reader-checklist.md](docs/screen-reader-checklist.md).

## 10. Performance budgets

- **JavaScript:** at most 110 KB gzipped on the first load of any screen: the app, one language and that screen's code (React 19 is 67.5 KB of that, leaving about 40 KB for the app).
- **CSS:** at most 15 KB gzipped.
- **On demand:** the QR code, CSV export, About page, inactive language, join screens, share sheet and Join with a link load only when needed. The service worker keeps them all, so they work even if the phone goes offline before they're first used. Group screens load the sync engine just after their first render.
- **First paint:** the build prerenders the home screen, in English and in Vietnamese, and a loading frame for every other address into the HTML. The inline script shows the one that fits, so text appears before any JavaScript runs. Once the browser has shown it, the app replaces it with the same markup (instead of hydrating), keeping keyboard focus where it was.
- **Loading:** the CSS is one stylesheet, so the first paint waits on a single small request. Every screen but home is its own chunk, and the app fetches them all once it's idle.
- **Lighthouse:** run on the production build, served compressed as Cloudflare serves it, with mobile defaults (about 1.6 Mbps, 150 ms round trip, 4× slower CPU). Targets: Performance ≥ 95, Accessibility 100, Best Practices ≥ 95, LCP ≤ 2.0 s, Total Blocking Time ≤ 150 ms, CLS ≤ 0.05.
- **Repeat visits:** load from the service worker with no network.
- **Long lists:** the expense list stays smooth at 2,000 expenses with Chrome's CPU slowed 4× as a stand-in for a low-end Android phone, with rows memoized by React Compiler. Virtualization is added only if profiling calls for it. `pnpm perf` measures it (on demand, since shared CI machines vary too much): about 1.4 s to open, 60 fps scrolling (95th percentile frame 17 ms) and about 140 ms for the slowest key press in search. `content-visibility` on each day made opening slower and helped nothing, so it isn't used.
- **Enforcement:** CI checks every budget with a bundle-size script (it measures exactly what a first visit downloads) and Lighthouse CI.

## 11. Design

- **Layout:** mobile-first single column, up to about 720 px wide on larger screens. Inside a group, a bottom tab bar keeps everything in reach of one thumb.
- **Type:** the system font stack (nothing to download, full Vietnamese support), with tabular numerals for amounts.
- **Tokens:** CSS custom properties for color (light and dark), spacing (4 px base), a rem-based type scale, radius, elevation and motion.
- **Color:** one accent color, plus separate "gets back" and "owes" colors that are always paired with text.
- **Theme:** follows the system, with a manual System, Light or Dark switch.
- **Avatars and icon:** avatars show initials on a color derived from the member ID. The app icon uses a tally-mark motif.
- **Review:** you see the first screens at milestone 2.

## 12. Tech stack and layout

```
tally/
├─ src/
│  ├─ domain/     money, split, settle, hlc, ops, fold, validate (pure TypeScript, no React)
│  ├─ sync/       crypto, links, IndexedDB, socket, sync engine
│  ├─ i18n/       en.ts, vi.ts, formatters
│  ├─ ui/         tokens.css and shared components
│  ├─ features/   home, group, expenses, payments, balances, activity, settings, share
│  └─ app/        routes, layout, service worker registration
├─ worker/        Worker entry and the GroupLog Durable Object
├─ shared/        protocol types used by both the app and the relay
├─ e2e/           Playwright tests
├─ docs/          the screen reader checklist
├─ public/        icons and manifest assets
└─ .github/workflows/ci.yml
```

- **Code quality:** strict TypeScript, ESLint (typescript-eslint, react-hooks, jsx-a11y) and Prettier.
- **State:** the folded log sits behind a small store exposed through `useSyncExternalStore`. There is no state library.

## 13. Testing, CI and deployment

- **Unit and property tests** (Vitest and fast-check) cover everything in `src/domain` and `src/sync`, with at least 95% coverage of each of those folders. Properties tested:
  - Every split sums to its amount.
  - Balances always sum to zero.
  - Applying the settle-up transfers zeroes every balance, uses at most n − 1 transfers, and matches a brute-force minimum for small groups.
  - Any delivery order of the same operations folds to the same state.
  - Encrypting then decrypting returns the original, and any tampering fails.
- **Relay tests** run in the Workers runtime (`@cloudflare/vitest-plugin`, the successor to `vitest-pool-workers`, which doesn't support Vitest 5) and cover auth, deduplication, cursors, limits (per group, per connection and per IP address), broadcast, the retention alarm and re-upload after deletion.
- **End-to-end tests** (Playwright, Chromium and mobile WebKit) run the walkthrough in section 3 with up to four browser contexts as separate phones, one of them going offline midway. They also cover joining by link, restoring from Activity, the CSV contents and both languages.
- **Accessibility:** axe runs on every screen, in both themes and both languages.
- **CI:** GitHub Actions runs on every push to `main` and on every pull request, in three parallel jobs: typecheck, lint, unit and property tests, relay tests, build and bundle size; end-to-end tests with axe; and Lighthouse CI (median of three runs). The deploy waits for all three.
- **Deploy:** on `main`, and only after every check passes, Wrangler deploys the Worker, its static assets and any Durable Object migrations. A smoke test then loads the live site and confirms the relay answers, without creating any data.
- **Secrets:** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` live in GitHub Actions secrets, which you add. I never see the token.
- **Rollback:** `wrangler rollback` restores the previous version in seconds.
- **Address and link previews:** one Worker named `tally` at `tally.nhatt.workers.dev`. Shared links show a generic Tally preview, because group names are encrypted, and group pages send `noindex`.
- **Logs:** the relay logs errors only, never group IDs or contents.
- **Free plan:** Tally runs on Cloudflare's free plan. If its daily limits are ever reached, sync pauses until the daily reset while the app keeps working offline. The paid plan costs $5 a month.

## 14. Milestones

After each milestone I stop so you can try it and redirect.

| # | Milestone | What you can do at the check-in |
|---|---|---|
| 1 | Foundation and money core: rename `master` to `main`, tooling, CI and the deploy pipeline with a placeholder page live, and all domain logic with full tests | Read the rules as code and tests, see CI pass, and open the placeholder at your live address |
| 2 | Core screens on one device: groups, expenses with all split modes, payments, balances, settle-up, activity, categories, search and filters, CSV export, English and Vietnamese, light and dark themes, all saved in IndexedDB | Use Tally on one device, and review the design and the Vietnamese copy |
| 3 | Sync and encryption: relay, end-to-end encryption, invite links, join flow, QR sharing, live sync, offline queue, reconnection and re-upload | Share a group between your phones on the live address and watch them sync, including after going offline |
| 4 | PWA and polish: service worker, install and update flows, persistent storage, in-app browser hint, About page, accessibility and performance audits, and budgets enforced in CI. Then v1 is tagged and the Preview label removed | Install Tally from the live address, use it fully offline, and read the Lighthouse and axe results |

### Setup (done on 2 November 2026)

- The GitHub CLI is signed in as nhatnguyen1873, with the `workflow` permission that pushing CI files requires.
- The Cloudflare account's workers.dev subdomain is `nhatt`.
- The repository's Actions secrets `CLOUDFLARE_API_TOKEN` (made from the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID` are set.

## 15. Not in v1

- Multiple currencies in one group
- Receipt photos
- A shareable summary image
- Recurring expenses
- A bank-transfer QR code (VietQR) at settle-up
- More languages
- Multiple payers for one expense
- Notes on expenses
- Amount shorthand ("120k")
- A pairwise view of debts
- Rounding settle-up amounts to 1,000₫
- Push notifications
- Deleting a group for everyone
- An in-app QR scanner
- Category suggestions from titles
- Accounts, or syncing your list of groups across devices
- A staging environment
- A custom domain

## 16. Known risks

- **Lost link:** if every member loses both the link and their local data, the group can't be recovered. That's the cost of end-to-end encryption.
- **Open editing:** anyone with the link can change anything. The attributed history and Restore are the safeguard.
- **Clock drift:** a device whose clock runs far ahead keeps winning edits until real time catches up. The app warns when a clock is off.
- **iOS storage:** covered in section 7.
- **Spam:** anyone holding the link could flood a group with operations. Relay limits cap the damage, and v1 accepts the rest.
- **Retention:** a group nobody opens for a year is deleted from the relay. If no device still holds it by then, it's gone.
- **Free plan limits:** heavy use could hit Cloudflare's daily free limits and pause sync until the reset (section 13).
