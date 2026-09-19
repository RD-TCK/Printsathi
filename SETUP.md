# Printiva setup and acceptance checks

Use Node.js 22 or later. Run these commands in `Printiva-main` (the outer workspace forwards the common commands too):

```powershell
npm ci
Copy-Item .env.example .env.local  # Only for a NEW installation; preserve existing credentials.
npm run setup:check
npm run dev:web
```

## Database and uploads

Fill the Supabase URL, anon key and service-role key in `.env.local`. Keep the service-role key server-only. Apply every SQL file in `supabase/migrations` in filename order, including the `print_submitted` migration. The migrations create the private `print-documents` bucket, tables, policies and queue RPCs. Create/sign in to a shop owner account, enable accepting orders, check the subscription/trial, and add prices for the supported paper sizes and color modes.

Uploads are converted on the server before page counting and pricing. Supported: PDF, JPEG, PNG, WebP, GIF (first frame), TIFF (first image), Word, PowerPoint, Excel, OpenDocument, RTF, text, CSV and Markdown (as plain text). Unsupported, damaged and password-protected files fail explicitly. Files are limited to 25 MB each, 10 per upload and 100 MB combined; normalized PDFs are limited to 50 MB and 2,000 pages.

Install LibreOffice on the **web server**, then set `LIBREOFFICE_PATH` to its executable if outside the default Windows location. Linux deployments should set `/usr/bin/libreoffice`. Office conversion uses isolated temporary profiles with macros disabled. Host this on a persistent Node server capable of spawning LibreOffice; a serverless deployment without LibreOffice cannot convert Office uploads. Use PDFs there instead. Image rendering uses Sharp. Test the result of spreadsheet/presentation conversion before accepting production orders because page layout follows the document's print settings.

## Razorpay

Paste matching keys in `.env.local` and restart the web server:

```dotenv
RAZORPAY_KEY_ID=rzp_test_REPLACE
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_REPLACE
RAZORPAY_KEY_SECRET=REPLACE
RAZORPAY_WEBHOOK_SECRET=REPLACE_WITH_YOUR_WEBHOOK_SECRET
```

Use real Razorpay test keys for testing; replace both key IDs and the secret with live credentials when ready. Missing keys disable payment; they never create a fake successful payment. Enable automatic capture in Razorpay. Configure the public HTTPS webhook URL `https://YOUR-DOMAIN/api/payment/webhook` for `payment.captured`, `order.paid` and `payment.failed`, using the same webhook secret. Razorpay cannot reach a localhost webhook; use a public HTTPS test deployment/tunnel for that test.

Checkout signatures are checked, then the server requires a captured payment matching the stored order ID, exact amount and currency. Signed webhooks recover a payment if the browser closes. Callbacks/webhooks can repeat without resetting submitted jobs. See [Razorpay integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [webhooks](https://razorpay.com/docs/webhooks/).

## Windows printing

1. Install the printer's Windows driver. A **Windows test page must physically print** before Printiva can print through that driver. Installed queues and Windows success events alone do not prove output.
2. Run `npm run build:agent` on Windows. This builds `dist/PrintivaAgent.exe` and verifies the embedded renderer. `/api/agent/download` serves it locally; set `AGENT_DOWNLOAD_URL` when hosting the binary elsewhere.
3. Launch the executable. Open **Printer** on the owner dashboard, generate a pairing key and enter it in the agent. Existing paired credentials are preserved when replacing the executable. Run only one agent per computer.
4. Keep the agent open/running, printer connected, paper loaded and the driver healthy. The standalone executable does not install an automatic Windows service. For automatic startup, add a shortcut to the user's Windows Startup folder or run it as part of your managed shop startup.
5. Before pairing, enter the website address in the agent's **Printiva website address** field, including its port (for example `http://localhost:3001`). For a remote shop computer, use the server's reachable address instead of localhost. This is the web URL, not a Supabase URL. `PRINTIVA_SERVER_URL` can also configure managed installations.

Opening the executable again reopens the existing agent dashboard. The owner Printer page refreshes every five seconds, and its default-printer selection persists across agent heartbeats. A locally detected printer is registered with the shop only after the agent is paired and connected.

USB discovery checks currently present USBPRINT devices as well as queue errors/offline flags. Agent polling checks every 5 seconds; server heartbeats are sent every 10 seconds and expire after 30 seconds. Virtual PDF/OneNote printers are excluded. Customers cannot start checkout without a fresh compatible physical printer. A printer disconnected after payment leaves the job waiting. Jobs are separated when paper size/color changes; all destinations are checked before printing.

The agent records **print_submitted** immediately before invoking the renderer, after checking the lease and requested printer settings. This reserves dispatch so a crash between sending pages and reporting success cannot automatically print them twice. It means dispatch has begun, not that paper has physically printed. The owner confirms printed pages in Jobs, which also updates the parent order. A failure after dispatch begins requires inspection before any retry. Generic Windows drivers cannot reliably confirm physical completion, paper jams or every network printer's physical presence. Inspect the Windows queue and device when output is missing.

## Verify before opening the shop

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run build:agent
```

With the web server running and an active configured shop, `node scripts/smoke-customer-flow.cjs` checks a real PDF upload, private storage, page counting, server pricing and public tracking. It removes its own unpaid test order and document afterward. It never initiates payment or printing.

- Upload a photo, a multipage PDF and a Word/RTF document; inspect page counts and prices.
- Unplug the USB printer: agent should show OFFLINE, and customer/owner status should update. No virtual printer should make checkout available.
- Reconnect and print a Windows test page. Pay for a one-page order with Razorpay test checkout. Confirm the correct physical page, size and color; then confirm completion in Jobs.
- Repeat payment notifications: they must not create duplicate printing.
- Close checkout/cause a failed payment: the job must stay locked. Missing keys must never show payment success.

Local regression tests verify conversion, pricing, payment matching, printer availability and renderer behavior. They cannot replace the physical printer and live/test Razorpay acceptance checks above.
