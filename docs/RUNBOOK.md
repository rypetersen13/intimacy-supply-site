# Runbook

## Roll back a bad deploy
Netlify > Deploys > pick the last good deploy > **Publish deploy**. Takes effect immediately.

## Rotate a secret (do one at a time, then place a test order)
1. Create the new value at the provider (CCBill Datalink password, Resend key, Firebase service account key, distributor FTP password).
2. Netlify > Project configuration > Environment variables: edit the variable, paste the new value, tick **Contains secret values**, save.
3. Trigger a deploy (Deploys > Trigger deploy) so functions pick it up.
4. Place a test order, then delete or disable the old credential at the provider.
CCBill salt: it must match on both sides. Ask CCBill support to change it while you update Netlify, at a quiet time.

## An order email says UNDERPAID
Do not ship. Open the order in Firestore (`orders/<id>`): compare `expectedTotal` and `paidAmount`. If CCBill charged less than expected, contact the customer or refund in CCBill.

## Publish Firestore rules
Copy your current rules somewhere safe. Firebase console > Firestore > Rules > paste `firebase/firestore.rules` > test in the Rules Playground (see cases below) > Publish. To undo, paste the old rules back.
Playground cases: signed-in user reads own order (allow) / another user's order (deny); user sets own `isVIP: true` (deny); user lowers own `credits` (allow) / raises them (deny); user marks own order paid (deny); signed-out user creates an order (deny); signed-out user reads approved reviews (allow).

## Errors customers hit
Netlify > Logs > Functions > `client-error`.

## Turn on the stock sync
1. Ask the distributor for a new SFTP password (the old one has been shared in chat), then add `ELDORADO_SFTP_HOST`, `ELDORADO_SFTP_USER`, `ELDORADO_SFTP_PASS` in Netlify as secret values and deploy.
2. Netlify > Functions > `sync-stock` > Run now (or wait for the schedule). Open its log: it prints `sync-stock summary` with the feed size, how many of our products would be marked unavailable, and how many prices are below the minimum advertised price.
3. If the numbers look right, add `SYNC_LIVE=1`, deploy, and run it again. The shop then hides unavailable products.
4. If a bad feed ever slips through, delete the `meta/stock` document in Firestore (everything shows as available again) or set `SYNC_LIVE` back to 0.

## Turn on review request emails
`send-review-requests` runs daily and, for paid orders about two weeks old, would email the buyer a discreet "How was your order?" message (no product names, with an opt-out link and postal address). It is a dry run until you set `REVIEW_EMAILS_LIVE=1`.
1. In Resend, verify your sending domain (add the DNS records it shows). The shared test sender cannot email customers.
2. In Netlify add `REVIEW_FROM_EMAIL` (for example `Intimacy Supply <orders@intimacysupply.com>`) and confirm `RESEND_API_KEY` is set.
3. Run the function once (Netlify > Functions > send-review-requests > Run now) and read the log line `send-review-requests summary`.
4. When the numbers look right, add `REVIEW_EMAILS_LIVE=1` and deploy.

## Turn on automatic Eldorado fulfillment
Two scheduled functions send paid orders to Eldorado and bring tracking back, using their Customer Integration Partner Portal (May 2026 spec). Both are dry runs until you set `ELDORADO_ORDERS_LIVE=1`.

- `send-orders-to-eldorado` (every 15 min): builds one XML order file per newly-paid order and uploads it to Eldorado's `uploads` SFTP folder. Marks the order `ordered` and stamps `eldoradoSentAt`.
- `import-eldorado-tracking` (every 30 min): reads Eldorado's `shipping_confirmation` folder, matches by our order number, marks the order `shipped` with carrier + tracking, and emails the customer.

Setup:
1. In Netlify, set `ELDORADO_SFTP_HOST`, `ELDORADO_SFTP_USER`, `ELDORADO_SFTP_PASS` (same login used for `sync-stock`).
2. Set `ELDORADO_ACCOUNT_ID` to your Eldorado business partner # (used as `AccountId` in every order — required, orders will fail to build without it).
3. Confirm `RESEND_API_KEY` and `REVIEW_FROM_EMAIL` are set (shared with review emails) so tracking emails can send.
4. Run both functions once (Netlify > Functions > run now) and read the log lines `send-orders-to-eldorado summary` / `import-eldorado-tracking summary`. In dry run they log what they *would* send/update without touching anything.
5. When the numbers look right, set `ELDORADO_ORDERS_LIVE=1` and deploy. From then on, a paid order needs no manual step — the "Copy order for Eldorado" button in admin becomes a fallback for if a file fails to send.
