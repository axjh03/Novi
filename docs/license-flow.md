# License flow proposal

Use one license model and one plan-to-feature table for both manual and paid access. Keep account roles, plan features, license expiry, and the one-active-device session rule separate.

| Route | Who starts it | What authorizes access |
| --- | --- | --- |
| Manual | A customer contacts the team | An administrator deliberately issues a license with a plan, owner, and term, then it is assigned to a desktop account. Free or special arrangements should record a reason. |
| Automatic, later | A customer completes hosted checkout | A verified provider payment event creates or renews the same kind of license using the server's price-to-plan mapping. |

Today, the website implements the purchase preview only: choose a plan → contact details → payment review → developer help. The final step says: “Online payment isn't ready yet. Call MUKUL KAWADI WALA, the developer, for help.” No charge, account, license, or order is created. The email handoff lets the team complete the existing manual process.

When real payments are introduced:

1. Keep product/price IDs mapped to Core, Pro, Ultimate, and Lifetime on the server. Browser amounts and the return page must not grant access.
2. Verify the provider event and payment status. Persist a unique provider event/order ID with the license change in one transaction so retries cannot grant twice. Signed callbacks and duplicate-event handling are standard requirements; see the [Stripe webhook documentation](https://docs.stripe.com/webhooks).
3. Set recurring expiry from the provider's paid billing period. Renew after confirmed payment; keep access until the paid period ends when a customer cancels. Lifetime keeps its existing Pro features without a recurring expiry.
4. Define refund, dispute, and failed-payment rules before launch. Record grant source, external payment reference, and every access change in the audit history. Manual grants should keep their explicit term rather than being silently changed by an unrelated payment event.
5. Keep the current permanent desktop-account assignment and exclusive device lease. Buying another seat issues another license; changing computers releases the existing session instead of consuming a new license.

The next payment milestone should be one complete provider sandbox flow, including duplicate events, renewals, cancellations, and refunds, before enabling checkout in production. No payment provider is chosen or connected by this change.
