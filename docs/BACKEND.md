# Backend overview

**Shape:** static site on Netlify + small serverless functions + Firebase (Auth, Firestore) + CCBill (payments) + Resend (order email).

## The purchase flow
1. Customer signs in (Firebase Auth) and places an order. The browser writes an **unpaid** order to Firestore (`orders/IS-YYYYMMDD-XXXX`) that includes a private `accessKey`.
2. The browser calls `ccbill-checkout-link` (joining VIP) or `ccbill-onetime-link` (regular purchase / member remainder) with the customer's Firebase **ID token**.
3. The function verifies the token, loads THAT customer's unpaid order, and **recomputes the amount** from `products.json` (VIP or regular price, tokens the member really has, shipping, tax). If the browser total is lower than the server total the request is refused. The server total is saved on the order as `expectedTotal`, and CCBill's signed payment link is built from it.
4. CCBill bills the customer and calls `ccbill-webhook`. The webhook (allowed CCBill IPs only) compares what CCBill charged with `expectedTotal`. Match: order `paid`, affiliate credited, order email sent. Clearly less: order `underpaid`, email flagged "Do NOT fulfill". Cannot verify: order `paid` but flagged.
5. `get-order` (order confirmation page) needs the order's private `accessKey`; order numbers alone return nothing.

## Functions (netlify/functions)
| Function | Purpose |
|---|---|
| ccbill-checkout-link / ccbill-onetime-link | Server-priced CCBill links (see above) |
| ccbill-webhook | Payment events from CCBill; amount check; VIP status; tokens |
| ccbill-cancel | Cancels a subscription through CCBill Datalink |
| affiliate | Creator dashboard: verifies handle + access code, returns only that partner's totals (no customer data), creates payout requests |
| get-order | Order confirmation data (needs access key) |
| membership-request | Membership requests to the operator |
| client-error | Browser error reports written to the function log |
| _lib/* | Shared code: Firestore REST client, token verification, pricing |

## Environment variables (Netlify)
`CCBILL_SALT_KEY`, `CCBILL_DATALINK_USER`, `CCBILL_DATALINK_PASS`, `FIREBASE_SERVICE_ACCOUNT` (base64 JSON), `RESEND_API_KEY`, `ORDER_NOTIFY_EMAIL`, optional `GA4_API_SECRET`, `CCBILL_SKIP_IP_CHECK` (never set in production). Mark every secret as "contains secret values".

## Stock sync
`sync-stock` runs twice a day (05:00 and 14:00 UTC, after the distributor's nightly feed). It downloads `feeds/product_feed.tsv` over SFTP, finds our models that are missing, discontinued, or at zero quantity, and saves that list in Firestore (`meta/stock`). The storefront reads it through the public `stock` function and hides those products; checkout refuses them. It also logs how many of our VIP prices are below the distributor's minimum advertised price (`map_price`).
It is a **dry run until `SYNC_LIVE=1`** is set. Guards refuse to publish a broken-looking feed (fewer than 5,000 rows, or a sudden jump in unavailable items).
Env vars: `ELDORADO_SFTP_HOST`, `ELDORADO_SFTP_USER`, `ELDORADO_SFTP_PASS`, optional `ELDORADO_FEED_PATH`, `SYNC_LIVE`.

## Catalog
`tools/source/products.raw.json` is the source. `python3 tools/build_catalog.py` regenerates `products.json`, product/category/brand pages, and the sitemap. `python3 tools/build_assets.py` splits the built `index.html` into cached assets.

## Tests
`npm test` runs pricing, checkout, webhook and token tests plus site checks (scripts parse, catalog valid, sitemap links exist, no secrets). CI runs the same on every push.

## Known gaps
- Product and category pages are built from the catalog snapshot, so their stock badges lag until the next catalog build; the shop and checkout use the live stock list.
- Token balance is decremented by the browser (rules only allow it to go down); moving it server-side is the next step.
- Order numbers use 4 random digits per day; a duplicate would be rejected by the rules.
