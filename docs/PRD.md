# Asoebi MVP Product Requirements Document

## Document status

- **Status:** Draft v0.1
- **Date:** August 25, 2026
- **Audience:** Product and engineering
- **Source:** Party planning and logistics meeting notes dated August 25
- **Implementation status:** Not started

## Summary

Asoebi is a private, event-specific ordering and coordination product for aso ebi. It gives an organizer one place to publish the items available for an event, collect guest selections and fulfillment details, review proof of off-platform payment, and coordinate each order through fulfillment.

The MVP replaces fragmented WhatsApp conversations and operational spreadsheets with a guest ordering experience and an organizer dashboard. It does not process money, operate a marketplace, or provide dispatch services.

## Problem

Aso ebi coordination is usually handled by a celebrant, family member, or designated coordinator. They must repeatedly ask guests what they are buying, calculate totals, share bank details, verify transfers, gather delivery information, and track fulfillment. The information is commonly split across WhatsApp messages, bank records, and spreadsheets, making the process time-consuming and error-prone.

Guests also lack a consistent way to understand what is available, submit a family-sized order, provide proof of payment, and know whether their order is paid, preparing, ready, dispatched, or fulfilled.

## Goals

1. Give organizers a self-serve way to create and publish a private event ordering page.
2. Let authenticated guests place and manage orders for themselves or their families.
3. Consolidate item selections, payment evidence, contact details, and fulfillment information.
4. Prevent overselling by reserving inventory when an order is submitted.
5. Let organizers manually reconcile external payments and update fulfillment progress.
6. Keep guests informed through email and opt-in WhatsApp notifications.
7. Run one real event end-to-end without a separate spreadsheet acting as the source of truth.

## Non-goals

The MVP will not include:

- In-app payments, automatic bank reconciliation, partial payments, refunds, or currency conversion.
- A public marketplace, public event directory, or shared fabric catalog.
- Bundles, discount rules, promotions, or shared component inventory.
- Multiple event owners, organizer collaborators, or role-based event permissions.
- Platform subscriptions, event fees, or other monetization.
- Dispatch booking, delivery rate calculation, driver assignment, live tracking, or delivery guarantees.
- Spreadsheet synchronization. CSV export is one-way.
- SMS, WhatsApp marketing, or conversational WhatsApp support.
- Native mobile applications.

## Users

### Organizer

The celebrant, family member, event planner, or designated coordinator responsible for configuring the event, reviewing orders and payments, and coordinating fulfillment.

Each event has exactly one owner in the MVP. A user may own multiple events and may also order as a guest at other events.

### Guest

An invited attendee purchasing fabric, caps, or other event-specific items for themselves, a partner, or family members.

Guests access an event through its private link and must have an account before viewing payment instructions or submitting an order.

## Core user journeys

### Organizer creates an event

1. The organizer registers or signs in.
2. The organizer creates a draft event.
3. The organizer adds event details, one currency, ordering controls, items, payment instructions, and fulfillment options.
4. The organizer publishes the event and shares its private link.

### Guest places an order

1. The guest opens the private event link and signs in or creates an account.
2. The guest selects item quantities and a fulfillment option.
3. The guest supplies the contact and fulfillment information required by that option.
4. The product calculates the item subtotal, fulfillment fee, and total.
5. The guest follows the organizer's external payment instructions and uploads proof of payment.
6. The guest submits the order. Inventory is reserved and payment enters review.

### Organizer reconciles and fulfills an order

1. The organizer reviews the order and its payment proof.
2. The organizer confirms or rejects the payment.
3. A confirmed order becomes locked against guest changes.
4. The organizer moves the order through the applicable fulfillment statuses.
5. The guest receives status notifications and can view the current state from their account.

## Functional requirements

### Accounts and access

- **FR-AUTH-1:** Users can register, sign in, sign out, and reset a password using email and password.
- **FR-AUTH-2:** Email addresses must be verified before a user can publish an event or submit an order.
- **FR-AUTH-3:** A user can act as an organizer for events they own and as a guest for other events without separate accounts.
- **FR-AUTH-4:** Only the event owner can view or change event administration, payment proofs, guest personal information, or exports.
- **FR-AUTH-5:** Events are unlisted and use non-guessable shareable links. There is no public event discovery.

### Event management

- **FR-EVENT-1:** An organizer can create, edit, publish, close, reopen, and archive an event.
- **FR-EVENT-2:** An event includes a name, description, date, location or location note, contact information, and optional cover image.
- **FR-EVENT-3:** An event uses exactly one organizer-selected currency, defaulting to NGN. The product does not convert currencies.
- **FR-EVENT-4:** An organizer must set an ordering deadline. When the deadline passes, new orders and guest edits are blocked.
- **FR-EVENT-5:** Closing an event immediately blocks new orders and guest edits without removing existing order access.
- **FR-EVENT-6:** Publishing requires at least one available item, external payment instructions, and one fulfillment option.

### Item catalog and inventory

- **FR-ITEM-1:** An organizer can create, edit, hide, and reorder independent items within an event.
- **FR-ITEM-2:** Each item includes a name, unit label, price, starting inventory, and optional description.
- **FR-ITEM-3:** Item quantities are positive whole numbers. A fabric unit such as a five-yard pack is represented as one independently priced item.
- **FR-ITEM-4:** Guests can combine multiple items and quantities in one order.
- **FR-ITEM-5:** The product displays current availability and prevents a submitted order from exceeding available inventory.
- **FR-ITEM-6:** Inventory is reserved atomically when an order is submitted, adjusted when a pending order is edited, and released when payment is rejected or the order is cancelled.
- **FR-ITEM-7:** Resubmitting a rejected order must recheck and reserve inventory. Previously available stock is not guaranteed.

### Fulfillment configuration

- **FR-FULFILL-1:** An organizer can create named pickup or delivery options for an event.
- **FR-FULFILL-2:** Each option includes a label, type, flat fee, instructions, availability state, and the guest information it requires.
- **FR-FULFILL-3:** Pickup options can require a pickup contact, location, and instructions.
- **FR-FULFILL-4:** Delivery options can require recipient name, phone number, address, delivery availability, and notes.
- **FR-FULFILL-5:** A fulfillment fee is added once per order and uses the event currency.
- **FR-FULFILL-6:** Capturing a delivery choice does not imply that Asoebi books, performs, or guarantees delivery.

### Guest ordering

- **FR-ORDER-1:** A guest can maintain one active order per event and use item quantities to represent a family-sized purchase.
- **FR-ORDER-2:** Before submission, the product displays line items, quantities, unit prices, item subtotal, fulfillment fee, and total.
- **FR-ORDER-3:** Submission requires guest contact details, a valid fulfillment selection, all fields required by that selection, and payment proof.
- **FR-ORDER-4:** Payment proof accepts JPEG, PNG, or PDF files up to 10 MB.
- **FR-ORDER-5:** A guest can view, edit, or cancel an order while payment is pending review and the event remains open.
- **FR-ORDER-6:** A quantity or fulfillment change that alters the total invalidates the existing payment proof and requires a new proof before resubmission.
- **FR-ORDER-7:** After payment confirmation, only the organizer can alter or cancel the order. Any refund or balance adjustment is handled outside the product.
- **FR-ORDER-8:** Every order receives a human-readable reference and retains timestamps for submission and state changes.

### Payment review

- **FR-PAY-1:** An organizer can provide bank transfer or e-transfer instructions for an event. These instructions are visible only to authenticated guests accessing the private event.
- **FR-PAY-2:** Submitted orders enter `Pending review` and show the uploaded proof to the event owner.
- **FR-PAY-3:** The organizer can mark a payment `Confirmed` or `Rejected` and provide an optional note.
- **FR-PAY-4:** Rejection releases reserved inventory and lets the guest correct the order or proof and attempt resubmission.
- **FR-PAY-5:** Confirmation locks guest editing and makes the order eligible for fulfillment processing.
- **FR-PAY-6:** The product records the actor and timestamp for every payment decision.

### Fulfillment tracking

- **FR-STATUS-1:** Payment status and fulfillment status are tracked independently.
- **FR-STATUS-2:** Fulfillment supports `Pending`, `Preparing`, `Ready for pickup`, `Dispatched`, `Fulfilled`, and `Cancelled`.
- **FR-STATUS-3:** Only the organizer can change fulfillment status.
- **FR-STATUS-4:** The organizer chooses only statuses applicable to the order's pickup or delivery method.
- **FR-STATUS-5:** Every status change records the actor and timestamp and is visible in the guest's order history.

### Notifications and WhatsApp

- **FR-NOTIFY-1:** Transactional email is sent for order submission, payment confirmation or rejection, cancellation, and fulfillment status changes.
- **FR-NOTIFY-2:** An organizer can connect and disconnect their own WhatsApp Business account through the supported integration.
- **FR-NOTIFY-3:** Guests must provide a valid international-format phone number and explicitly opt in before receiving WhatsApp notifications.
- **FR-NOTIFY-4:** When the organizer is connected and the guest has opted in, approved transactional WhatsApp templates are sent for the same lifecycle events as email.
- **FR-NOTIFY-5:** WhatsApp failure must not block the underlying order action or its email notification.
- **FR-NOTIFY-6:** The organizer can see whether each notification is queued, sent, delivered where supported, or failed, and can retry failed notifications.

### Organizer dashboard and export

- **FR-DASH-1:** The dashboard summarizes item demand, reserved and remaining inventory, order value, payment states, and fulfillment states.
- **FR-DASH-2:** The organizer can search by order reference or guest and filter by item, payment status, fulfillment status, and fulfillment option.
- **FR-DASH-3:** The organizer can open an order to review line items, proof of payment, guest details, fulfillment information, notes, and status history.
- **FR-DASH-4:** The organizer can export the current filtered order set as CSV.
- **FR-DASH-5:** CSV output uses one row per order line and includes order reference, item, quantity, unit price, order total, guest details, fulfillment information, payment status, fulfillment status, and relevant timestamps.

## State models

### Event

- `Draft`: Editable by the owner and unavailable to guests.
- `Published`: Available through the private event link while ordering is open.
- `Closed`: Existing orders remain accessible, but new orders and guest edits are blocked.
- `Archived`: Hidden from the organizer's active list; order data remains retained.

### Payment

- `Pending review`: Proof submitted and inventory reserved.
- `Confirmed`: Organizer verified payment; guest editing is locked.
- `Rejected`: Organizer rejected proof; inventory is released and the guest may resubmit.

### Fulfillment

- `Pending`: Payment may be under review or fulfillment has not started.
- `Preparing`: The organizer is assembling the order.
- `Ready for pickup`: A pickup order is ready for collection.
- `Dispatched`: A delivery order has left the organizer, without platform tracking or guarantees.
- `Fulfilled`: Pickup or delivery is complete.
- `Cancelled`: The organizer ended fulfillment; any financial resolution is offline.

## Business rules

1. An order must be paid in full outside the product; partial-payment tracking is unsupported.
2. Inventory is authoritative within each event and cannot become negative.
3. Inventory changes and order submission must succeed or fail together.
4. Prices captured on an order do not change when the organizer later edits an item price.
5. A flat fulfillment fee is captured with the order and does not change retroactively.
6. Closing an event or reaching its deadline does not cancel existing orders.
7. Rejecting payment releases inventory; confirming payment does not change the existing reservation.
8. Cancelling an order releases its inventory exactly once.
9. Email is the required notification channel. WhatsApp is additive and depends on organizer connection and guest consent.
10. The event owner remains responsible for payment verification, fulfillment, dispatch arrangements, and offline refunds.

## Non-functional requirements

- **NFR-1 — Scale:** Support at least 1,000 orders per event without degraded administrative usability.
- **NFR-2 — Concurrency:** Prevent overselling during concurrent submissions and make order and inventory mutations idempotent.
- **NFR-3 — Security:** Hash passwords using an established adaptive algorithm and protect sessions against common web attacks.
- **NFR-4 — Authorization:** Enforce event ownership and guest order access on every server-side read and mutation.
- **NFR-5 — Data protection:** Encrypt transport, restrict payment proof and personal-data access, and avoid exposing bank details in logs or notifications.
- **NFR-6 — Upload safety:** Validate file size and type, store payment proofs privately, and serve them only through authorized access.
- **NFR-7 — Reliability:** Notification-provider failure must not roll back a successful order or status transition.
- **NFR-8 — Auditability:** Preserve actor, timestamp, previous state, and new state for payment and fulfillment decisions.
- **NFR-9 — Accessibility:** Core organizer and guest journeys must support keyboard operation, visible focus, form labels, understandable validation, and sufficient contrast.
- **NFR-10 — Responsiveness:** Guest ordering and organizer review must work on current mobile and desktop browsers, with mobile treated as a primary guest surface.
- **NFR-11 — Export security:** CSV exports must be generated only for the owner and must not be publicly addressable.

## Success criteria and launch gate

The MVP is validated when one real event completes the following lifecycle with Asoebi as the operational source of truth:

1. The organizer independently creates and publishes the event.
2. Real guests submit receipt-backed orders through private links.
3. Inventory remains accurate with no duplicate reservations or overselling.
4. The organizer confirms or rejects payments from the dashboard.
5. Email and connected, opted-in WhatsApp notifications reflect lifecycle changes.
6. The organizer coordinates pickup and delivery using the dashboard and CSV export.
7. Orders reach `Fulfilled` without a separate spreadsheet being required to reconstruct current state.
8. No guest can access another guest's private order or another organizer's event administration.

## Acceptance scenarios

1. **Publish readiness:** An event without an item, payment instructions, or fulfillment option cannot be published and explains what is missing.
2. **Successful family order:** A guest orders multiple item quantities, selects delivery, uploads valid proof, and sees the correct total and reserved stock.
3. **Concurrent last unit:** Two submissions compete for the last unit; only one succeeds and inventory never becomes negative.
4. **Pending edit:** A guest changes a pending order, the reservation adjusts atomically, and a changed total requires new proof.
5. **Payment rejection:** The organizer rejects proof, inventory is released, the guest is notified, and resubmission succeeds only if stock is available.
6. **Payment confirmation:** Confirmation locks guest editing and records the organizer and timestamp.
7. **Manual fulfillment:** The organizer moves a pickup order to `Ready for pickup` and a delivery order to `Dispatched`; guests receive the applicable updates.
8. **Notification fallback:** A WhatsApp failure is visible to the organizer while the order action and email still succeed.
9. **Ordering cutoff:** A closed or expired event blocks new orders and pending guest edits but preserves read access.
10. **Tenant isolation:** A user cannot access another organizer's dashboard, receipts, personal data, or export by changing a URL or identifier.
11. **Accurate export:** Filtered CSV rows match the visible orders, line items, statuses, totals, and fulfillment details.

## Future considerations

- Organizer collaborators and granular roles.
- Automated payment collection and reconciliation.
- Platform billing and monetization.
- Bundles, discounts, and more advanced catalog options.
- Optional images for catalog items.
- Inventory expiry for unpaid orders and automated reminders.
- Dispatch-provider integration, delivery windows, and live tracking.
- Additional notification channels and two-way customer support.
- Multi-currency pricing and settlement.
- Reporting across multiple events.

These considerations are intentionally excluded from the MVP until the first live event validates the core coordination workflow.
