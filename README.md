# Tally

Split shared expenses with friends: no sign-up, works offline, and only your group can read it.

[![CI](https://github.com/nhatnguyen1873/tally/actions/workflows/ci.yml/badge.svg)](https://github.com/nhatnguyen1873/tally/actions/workflows/ci.yml)

**Live preview:** [tally.nhatt.workers.dev](https://tally.nhatt.workers.dev) · **Status:** milestone 2 of 4 ([plan](SPEC.md#14-milestones))

One person creates a group and shares a link; everyone else taps it and is in. Expenses save instantly on the phone, even offline, and merge across everyone's phones when they reconnect. Settle up shows the fewest payments that clear every debt. The full v1 plan is in [SPEC.md](SPEC.md).

## How it works

- **Local-first sync.** Every change is an immutable operation stamped with a [hybrid logical clock](src/domain/hlc.ts). Each phone [folds](src/domain/fold.ts) the operations it has into the same state and activity feed, whatever order they arrived in.
- **Exact money.** Amounts are integers in the currency's smallest unit. [Splits](src/domain/split.ts) use the largest-remainder method, so every split adds up exactly and the extra đồng rotates between people.
- **Fewest transfers.** [Settle-up](src/domain/settle.ts) finds the most groups of people who can settle among themselves, with an exact search for up to 18 people, and tests check it against a brute-force minimum.
- **End-to-end encryption** (milestone 3). The key lives in the invite link's `#fragment`, which browsers never send to servers, and a Cloudflare Durable Object relays only ciphertext.
- **Fast on slow phones.** The home screen is prerendered into the HTML in both languages, so it paints before any JavaScript arrives, and CI holds every screen's first load to the [budgets](SPEC.md#10-performance-budgets) and Lighthouse thresholds.

## Develop

Needs Node 24 and pnpm 11.

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` serves the app and the Worker at http://localhost:5173. Other commands:

| Command           | What it does                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| `pnpm check`      | Types, lint, formatting, unit tests with coverage, build and bundle size   |
| `pnpm test:e2e`   | End-to-end and accessibility tests on the production build                |
| `pnpm lighthouse` | Lighthouse against the production build                                  |
| `pnpm preview`    | Serves the production build in the Workers runtime                        |

Before the first end-to-end run, install the test browsers with `pnpm exec playwright install chromium webkit`, and run `pnpm build`.

## Deploy

Every push to `main` deploys to Cloudflare once all checks pass ([workflow](.github/workflows/ci.yml)), followed by a smoke test of the live site. Deploying needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Layout

| Path            | Contents                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| `src/domain/`   | Money, splits, clocks, operations, fold, balances, settle-up: pure TypeScript |
| `src/app/`      | The app's frame, routes and preferences                                  |
| `src/features/` | One folder per screen                                                    |
| `src/sync/`     | IndexedDB storage and the live group store                               |
| `src/i18n/`     | English and Vietnamese catalogs and formatting                           |
| `src/ui/`       | Design tokens and shared components                                      |
| `worker/`       | The Cloudflare Worker (and, from milestone 3, the sync relay)            |
| `e2e/`          | Playwright tests                                                         |
| `scripts/`      | Prerendering, bundle-size check and the Lighthouse server                |

## License

[MIT](LICENSE). Icons are from [Lucide](https://lucide.dev) (ISC license).
