# License flow proposal

Use one license model and one plan-to-feature table for both manual and paid access. Keep account roles, plan features, license expiry, and the one-active-device session rule separate.

| Route | Who starts it | What authorizes access |
| --- | --- | --- |
| Manual | A customer contacts the team | An administrator deliberately issues a license with a plan, owner, and term, then it binds directly to an individual or is assigned to an enterprise desktop account. Free or special arrangements should record a reason. |
| Automatic, later | A customer completes hosted checkout | A verified provider payment event creates or renews the same kind of license using the server's price-to-plan mapping. |

The public purchase flow remains a preview: choose a plan → contact details → payment review → developer help. The final step says: “Online payment isn't ready yet. Call MUKUL KAWADI WALA, the developer, for help.” The preview creates no charge, account, license, or order. Individual signup is a separate action that creates an unlicensed account. The email handoff lets the team complete the existing manual process.

Inside the signed-in workspace, administrators can issue licenses manually, extend an existing term, and approve new-license requests. Owners can submit new-license requests to that queue or preview checkout. Their renewal action reviews the existing license and prepares an email for the developer; it does not submit a new-license request or extend access. Both checkout previews end at the same developer-help message. Lifetime licenses need no renewal, and terminated licenses stay closed.

When real payments are introduced:

1. Keep product/price IDs mapped to Core, Pro, Ultimate, and Lifetime on the server. Browser amounts and the return page must not grant access.
2. Verify the provider event and payment status. Persist a unique provider event/order ID with the license change in one transaction so retries cannot grant twice. Signed callbacks and duplicate-event handling are standard requirements; see the [Stripe webhook documentation](https://docs.stripe.com/webhooks).
3. Set recurring expiry from the provider's paid billing period. Renew after confirmed payment; keep access until the paid period ends when a customer cancels. Lifetime keeps its existing Pro features without a recurring expiry.
4. Define refund, dispute, and failed-payment rules before launch. Record grant source, external payment reference, and every access change in the audit history. Manual grants should keep their explicit term rather than being silently changed by an unrelated payment event.
5. Keep permanent assignment and the exclusive desktop device lease. Individuals retain one directly bound license; renew or change its plan. Additional enterprise seats get additional licenses; changing computers releases the existing session instead of consuming a new license.

The next payment milestone should be one complete provider sandbox flow, including duplicate events, renewals, cancellations, and refunds, before enabling checkout in production. No payment provider is chosen or connected by this change.

Individual accounts can be self-created or created by the administrator. They sign in on both web and desktop with the same credentials and use their own AI keys. Enterprise (`CORP` → `SUBCORP` → `LICENSE`) and existing legacy `STANDALONE` team hierarchies stay intact. The individual-account migration adds constraints and triggers without merging, deleting, or moving existing accounts.
