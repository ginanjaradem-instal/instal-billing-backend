# ISP Billing & CRM API

Backend MVP using Express 5 and PostgreSQL. It includes a public InstaLink website, an admin dashboard at `/admin`, staff JWT authentication, customer and service records, internet plans, monthly upfront invoice generation, Xendit payment links/webhooks, and support tickets.

## Run locally

1. Install dependencies with `npm install`.
2. Create a PostgreSQL database, then copy `.env.example` to `.env` and set `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, and the frontend `CORS_ORIGIN`.
3. Run `npm run migrate`.
4. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`; the password must be at least 12 characters. Run `npm run create-admin`.
5. Run `npm run dev`, then open `http://localhost:3000` for the public InstaLink website or `http://localhost:3000/admin` to sign in to the dashboard. The public site includes `/`, `/pasang-wifi-sumedang`, `/pasang-wifi-sumedang-murah`, `/galeri`, `/berita`, `/bayar`, `/kontak`, and `/corporate`. Use the admin credentials created in step 4. `GET /health` checks process health and `GET /ready` checks the database connection.

Migrations are applied in filename order and recorded in `schema_migrations`; subsequent runs skip migrations already recorded.

Do not commit `.env` or expose database/provider credentials. Use HTTPS and a restricted database user in deployment.

## API outline

Except for `/health`, `/ready`, `/api/auth/login`, and `/api/webhooks/xendit`, API routes require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Staff login |
| GET | `/api/public/plans` | Public list of active standard plans for the marketing landing page |
| POST | `/api/public/payment-link` | Publicly verifies an invoice number and customer code, then returns a payment link for a payable invoice (limited to 10 attempts per IP per 15 minutes) |
| POST | `/api/public/coverage-check` | Checks selected map/device coordinates against private KML cable routes; returns only an approximate availability message (limited to 30 attempts per IP per 15 minutes) |
| GET | `/api/overview` | Summary metrics, 6-month billing trend, active subscribers by plan, recent invoices, and priority support tickets |
| GET, POST | `/api/customers` | List customers with PPPoE connection/IP summary; create customers |
| PATCH | `/api/customers/:id` | Update customer details |
| PATCH | `/api/customers/:id/activation` | Admin reactivates a cancelled customer; previous cancelled services are retained |
| DELETE | `/api/customers/:id` | Admin soft-deletes a customer and cancels active services; history is retained |
| DELETE | `/api/customers/:id/permanent` | Admin permanently deletes the customer and related unpaid history; blocked if paid invoices or active Xendit links exist |
| GET | `/api/customers/:id` | Customer with service details |
| GET, POST | `/api/plans` | List plans; admin creates plans |
| PATCH | `/api/plans/:id` | Admin updates a plan; changes apply to future invoices |
| PATCH | `/api/plans/:id/activation` | Admin activates or deactivates a plan with `{ "isActive": true/false }` |
| DELETE | `/api/plans/:id` | Admin deactivates a plan; existing subscribers remain active and billable |
| DELETE | `/api/plans/:id/permanent` | Admin permanently deletes a plan only if no service has ever used it |
| GET, POST | `/api/routers` | Admin lists configured MikroTik routers without secrets and adds routers with encrypted credentials |
| PATCH | `/api/routers/:id` | Admin edits router settings or activates/deactivates an unused router |
| POST | `/api/routers/:id/test` | Admin tests API connectivity and read access to active PPPoE sessions |
| POST | `/api/routers/:id/script` | Admin generates a RouterOS setup script containing router API and RADIUS configuration |
| GET | `/api/routers/:id/sessions` | Admin lists up to 100 latest RADIUS accounting sessions |
| DELETE | `/api/routers/:id` | Admin deletes a router that has no active assigned services |
| GET, POST | `/api/services` | List services with live MikroTik PPPoE status, IP, caller-id, and uptime; admin assigns plans, PPPoE usernames, and routers |
| PATCH | `/api/services/:id` | Admin changes the customer's assigned plan, PPPoE username, or router |
| DELETE | `/api/services/:id` | Admin cancels a service; history is retained |
| DELETE | `/api/services/:id/permanent` | Admin permanently deletes a service only if its customer has no invoices |
| GET | `/api/invoices` | List/filter invoices |
| DELETE | `/api/invoices/:id` | Admin permanently deletes an unpaid invoice and its payment records; paid invoices or active Xendit links are protected |
| POST | `/api/invoices/generate` | Admin generates invoices for `{ "period": "YYYY-MM" }`; safe to retry |
| POST | `/api/invoices/:id/payment-link` | Admin creates a Xendit invoice payment link |
| GET, PUT | `/api/settings/general` | Admin reads or saves company invoice details, one or two bank accounts, and invoice reminder timing |
| GET | `/api/settings/invoice` | Admin reads invoice header design and logo previews |
| PUT, DELETE | `/api/settings/invoice/logo/:side` | Admin uploads or removes the left/right invoice logo (PNG, JPEG, or WebP; 2 MB maximum) |
| GET, POST | `/api/tickets` | List/create support tickets |
| PATCH | `/api/tickets/:id` | Update ticket status, priority, or assignee |
| GET, POST | `/api/users` | Admin lists staff and creates accounts (password minimum 12 characters) |
| POST | `/api/webhooks/xendit` | Xendit invoice callback |

The dashboard includes forms for these operations and is served from the same origin as the API, so the browser UI does not need a separate frontend server or CORS setup. The public installation and contact forms prepare a message for the visitor to send via WhatsApp or email; they do not submit personal details silently. The public payment page requires both an invoice number and customer code, and only returns the matched invoice's amount, due date, status, and Xendit payment URL. The public coverage checker displays an interactive Leaflet map: a visitor can click or move a pin to select any remote installation location, or use the current device location. The selected coordinates are sent only to the coverage API and are not returned or persisted; the external OpenStreetMap tile service receives requests for the map area viewed by the visitor. Results report whether a cable route is within 100 meters; a positive result is only an initial indication and must be confirmed by the team. Creating invoices or Xendit payment links changes real records; the dashboard asks for confirmation first.

The admin **Pengaturan Umum** page stores company name, address, phone, invoice description, one or two bank account details, and a selected invoice reminder lead time (3, 5, 7, or 10 days before the due date). Reminder timing is currently stored as configuration only: automatic email or WhatsApp delivery is not enabled until those integrations are implemented and configured.

The **Invoice** settings page stores separate left and right invoice logos in PostgreSQL and previews them around the centered company name and address from **Pengaturan Umum**. Logo uploads accept PNG, JPEG, or WebP up to 2 MB and are signature-checked. The preview is a design preview only; invoice PDF generation is not currently implemented.

Place the coverage source at `data/coverage/titik-pelanggan.kml` on the server. This private KML contains customer/network locations, is excluded from Git, and must not be placed under `public/` or otherwise exposed to the browser. Deploy it through a restricted server-side file transfer or secret/data provisioning process. Device geolocation requires HTTPS (except on localhost) and visitor permission. The map uses OpenStreetMap tiles and requires an internet connection.

Cancelled customers can be reactivated from the customers list. Reactivation does not restart their previously cancelled services; add a new service from the PPPoE services page to resume billing, while keeping the old service and invoice history intact.

Standard plans have catalog speeds and a fixed monthly price. OHO services use a fixed 100/50 Mbps profile with a 1:2 contention ratio; Dedicated services use a fixed 100/100 Mbps profile with a 1:1 contention ratio. Only the monthly price is negotiated per customer. These profiles are displayed in the plan and service lists and cannot be overridden per service. Invoice generation uses each OHO/Dedicated service's agreed monthly price and the catalog price for standard services. Price changes affect invoices generated afterward; existing invoices are not modified. Plan types cannot be changed after creation; create a new plan if a different plan type is needed.

The dashboard offers both deactivation and permanent deletion for customer data. Permanent customer deletion removes related services, tickets, unpaid invoices, and payment rows in one transaction; it is blocked if the customer has paid invoices or an active Xendit invoice. Permanent invoice deletion also removes its payment rows and is blocked for paid invoices and active Xendit invoices. Those actions require typing the customer code or invoice number to confirm. Permanent plan deletion requires typing its name and is blocked if any service, including cancelled historical services, references that plan. Permanent service deletion requires typing its PPPoE username and is blocked if the customer has any invoice history. Use permanent deletion only for test data; accounting/payment history should not be erased. Plans and individual services can be deactivated while their history is retained. Plans can be reactivated from the plans list; active subscriptions to an inactive plan remain active and billable, and the inactive plan is not selectable for new services.

Configure `XENDIT_SECRET_KEY` and `XENDIT_CALLBACK_TOKEN`, then set the callback URL in Xendit to `https://<your-domain>/api/webhooks/xendit`. The callback checks Xendit's callback token, invoice ID, and amount, and safely handles retries.

## Current scope

Invoice generation bills active services once per customer and billing month. `billing_day` is configurable from day 1–28. Amounts are whole Indonesian rupiah.

The API reads current PPPoE session status from `/ppp/active/print` on MikroTik and matches both the selected router and PPP username to each service. Admins can add multiple routers from the **Router MikroTik** dashboard menu, test their API connection, generate a RouterOS script, and assign a router when creating or editing a service. The generated script creates/updates a read-only RouterOS API account, configures timezone and PPP RADIUS, and enables accounting. Review the script before running it; it contains the API password and RADIUS shared secret. Existing local PPP accounts are not deleted. Router API passwords, RADIUS shared secrets, and PPPoE subscriber passwords are encrypted with AES-256-GCM before they are stored in PostgreSQL; the encryption key is not stored in the database. Generate a persistent 32-byte key, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, and set it as `MIKROTIK_ENCRYPTION_KEY` in the server environment before saving credentials. The value must be 64 hexadecimal characters. Back up this key separately from the database; losing or rotating it without re-encrypting stored credentials makes those credentials unusable.

The optional built-in PPPoE RADIUS server listens on UDP 1812 for authentication and UDP 1813 for accounting. Enable it with `RADIUS_ENABLED=true`, configure `RADIUS_BIND_ADDRESS` if needed (defaults to `0.0.0.0`), and allow those UDP ports only from configured MikroTik client/source addresses in the host firewall. `RADIUS_AUTH_PORT` and `RADIUS_ACCOUNTING_PORT` may be changed, but router settings must use the same values. The router form's RADIUS client address must match the source IP that reaches the backend (including any VPN/NAT). Authentication currently supports PAP and CHAP; configure new PPPoE access to use PAP or CHAP. MS-CHAP is not supported by this RADIUS service. RADIUS shared secrets and PPPoE passwords must be at least 16 and 1 characters respectively; subscriber passwords are never returned by the API. Accounting Start/Interim/Stop updates are stored in `radius_accounting_sessions`.

RADIUS uses a shared-secret protocol over UDP, not TLS. Keep traffic on a trusted private network or VPN, use a long random per-router shared secret, and firewall both RADIUS and RouterOS API ports to the expected peers. Do not expose these services to the public internet.

The services and customer lists show the live connection status, assigned PPP address, caller-id (usually the customer router's MAC), and uptime. This is a live snapshot cached for up to 10 seconds, not a historical accounting log. If a router is unconfigured or unreachable, connection status is shown as unknown rather than disconnected. The integration only reads session data; it does not provision, suspend, or change router configuration. Each configured router needs a reachable RouterOS API service and a dedicated read-only account; restrict router firewall access to the backend server.

For backward compatibility, one legacy router can still be configured with `MIKROTIK_HOST`, `MIKROTIK_USER`, and `MIKROTIK_PASSWORD` in the server environment. `MIKROTIK_TLS` defaults to `true`, using API-SSL on port 8729; set `MIKROTIK_PORT` explicitly if needed, and use unencrypted API only over a trusted private network or VPN. `MIKROTIK_TIMEOUT_SECONDS` defaults to 5. New multi-router configurations should be managed in the admin menu. Enable the RouterOS API service and use a dedicated account with read-only permissions. Restrict the router firewall to the backend server's source IP and never expose API ports to the public internet. RouterOS must allow `/ppp/active/print` with the selected account.
