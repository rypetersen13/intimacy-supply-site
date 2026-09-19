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
