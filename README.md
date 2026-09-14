# PrintSathi

PrintSathi is a multi-tenant printing SaaS: **Scan. Upload. Pay. Print.**

## Completed phases

### Phase 2: Supabase foundation

- Auth profiles, shops, memberships, subscriptions, Agents, printers, settings, pricing, documents, jobs, payments, QR codes, and audit logs
- UUID keys, foreign keys, timestamps, indexes, enums, constraints, onboarding RPCs, and RLS
- Server-side signup, login, logout, session refresh, and role protection

### Phase 2.1: Multi-document orders

- `orders` owns multiple documents and independently trackable print jobs
- One order-level payment can unlock all eligible jobs
- Extensible document formats and processing states
- `order_summary` view for shop/admin analytics

### Phase 3: Public website

- Marketing pages: `/`, `/features`, `/how-it-works`, `/pricing`, `/download`
- Responsive navigation, footer, feature sections, workflow steps, FAQ, and SEO files
- Real Supabase-backed `/shop/[shop_public_identifier]` customer entry route
- Public shop directory view exposing only intentional public fields

### Phase 4: Shop Owner Portal

- `/shop/dashboard`, `/shop/jobs`, `/shop/printer`, `/shop/pricing`, `/shop/qr`, `/shop/analytics`, `/shop/subscription`, `/shop/settings`
- Responsive owner navigation and database-backed shop context
- Real dashboard, job, printer, subscription, and order-summary reads
- Owner-only pricing CRUD with active-rule validation
- Real QR generation from the existing public shop URL
- Shop active and accepting-orders settings

### Phase 5: Customer printing experience

- Multi-document upload via private Supabase Storage
- PDF validation and page counting (pdf-lib)
- Per-document page ranges, color/B&W, and paper size configuration
- Server-side estimate API and save-configuration API
- Authoritative pricing calculation from the shop's active pricing rules
- Guest order access token for unauthenticated customers
- Mobile-first upload/configure/review/payment flow

### Phase 6: Production pricing engine

- Progressive volume slabs calculated server-side (`src/lib/pricing-engine.ts`)
- Per-color-mode and per-paper-size buckets with deterministic cent rounding
- Immutable `pricing_snapshot` and `pricing_calculated_at` timestamp on every order
- Tests cover slab boundaries, mixed modes, paper sizes, invalid ranges, missing pricing, and client-price tampering

### Phase 7: Razorpay payments

- Server-side Razorpay order creation with server-authoritative amount recalculation
- HMAC SHA-256 payment signature verification (timing-safe)
- Webhook signature verification with idempotent event deduplication
- `payment_transactions` ledger for every lifecycle event
- Failure and cancellation handling from the Razorpay Checkout modal
- Verified payment → order status transition → print job unlock

### Phase 8: Windows Desktop Agent

- Agent registration via one-time pairing code (`/api/agent/pair`)
- Bearer token authentication via SHA-256 token hash
- Heartbeat, printer discovery (Win32_Printer), and status reporting
- Atomic `claim_next_print_job` RPC with lease-based crash recovery
- `submit_print_job` RPC (records that the Windows Print Spooler accepted the job — duplicate-print guard)
- `complete_print_job` and `fail_print_job` RPCs with agent ownership validation
- PDF page-range extraction and submission to the Windows PrintTo verb
- Agent local config stored in `%LOCALAPPDATA%/PrintSaathiAgent`
- Agent web dashboard at `http://127.0.0.1:4321`

### Phase 9: Print idempotency and reconciliation

- `print_submitted` state prevents automatic re-claim of jobs that may already have reached the printer
- Expired `claimed` jobs are re-claimable only when `print_attempts < max_attempts`
- `print_submitted` jobs are never automatically re-claimed (require shop/admin reconciliation)
- Payment invariant: failed print jobs never modify the verified payment record

## Local setup

Requirements: Node.js 20 or newer, npm, and the Supabase CLI. Docker is required for local Supabase execution.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. Server-only credentials must never use the `NEXT_PUBLIC_` prefix.

## Required environment variables

| Variable                        | Scope       | Description                                                        |
| ------------------------------- | ----------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Client      | Supabase project URL                                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client      | Supabase publishable/anon key                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server only | Used for private storage access, order lifecycle, agent auth       |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`   | Client      | Razorpay publishable key (shown in checkout)                       |
| `RAZORPAY_KEY_ID`               | Server only | Razorpay key for order/payment APIs                                |
| `RAZORPAY_KEY_SECRET`           | Server only | Razorpay secret for HMAC verification                              |
| `RAZORPAY_WEBHOOK_SECRET`       | Server only | Razorpay webhook signature verification                            |
| `NEXT_PUBLIC_APP_URL`           | Client      | Production URL of the application                                  |
| `PRINTSAATHI_SERVER_URL`        | Agent       | Backend URL for the Windows Agent (default: `NEXT_PUBLIC_APP_URL`) |

## Supabase migrations

Migrations are in `supabase/migrations/`:

- `20260909000000_phase_2_foundation.sql` — Auth, profiles, shops, agents, printers, pricing, documents, jobs, payments, QR, RLS
- `20260909010000_orders_multi_document.sql` — Multi-document orders, payment-to-order unlock trigger
- `20260909020000_public_shop_directory.sql` — Public directory view
- `20260909030000_shop_portal_controls.sql` — Pricing overlap protection, portal write restrictions
- `20260909040000_customer_printing_foundation.sql` — Private storage bucket, public pricing view
- `20260909050000_public_print_status.sql` — Public printer status in directory view
- `20260909060000_pricing_snapshots.sql` — Immutable pricing snapshot on orders
- `20260909070000_guest_order_access.sql` — Guest order access token hash
- `20260909080000_production_razorpay_payments.sql` — Razorpay transaction ledger, webhook deduplication
- `20260909090000_phase_8_desktop_agent.sql` — Agent pairing, token auth, claim/complete/fail RPCs
- `20260909100000_print_submitted_state.sql` — `print_submitted` state for duplicate-print prevention

```powershell
supabase start
supabase db reset
supabase db lint
```

The RLS verification script is at `supabase/tests/rls/tenant_isolation.sql`. Replace its fixture UUIDs in a disposable database before running it.

## Security model

- Browser code receives only the Supabase publishable/anon key.
- Server actions use authenticated SSR clients and database RLS; no service-role key is exposed to client code.
- Customers are limited to their own orders, documents, jobs, and payments.
- Shop members are limited to their shop. Owners manage settings and pricing; Agent/printer state is not browser-writable.
- Admins have platform-wide access through database role checks.
- Public shop lookup uses a narrow directory view and a public identifier, never an internal UUID.
- Shop and QR public identifiers are immutable. Active pricing slabs cannot overlap.
- Guest order access uses a SHA-256 hashed token — raw tokens are never stored in the database.
- Agent credentials use SHA-256 hashed bearer tokens; the raw token is stored locally and never transmitted after initial pairing.
- Supabase Storage documents are private; access is authorized per-order through the claim/submit RPCs.

## Desktop Agent setup

```powershell
npm run agent -- --pair PS-XXXX-YYYY
# Dashboard: http://127.0.0.1:4321
```

See `/download` for full installation instructions.

## Validation

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test
```
