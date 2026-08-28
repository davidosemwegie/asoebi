# Aso Circle MVP Product Requirements Document

## Document status

- **Status:** Approved MVP v0.2
- **Date:** August 27, 2026
- **Audience:** Product and engineering
- **Source:** Party planning and logistics meeting notes dated August 25
- **Implementation status:** In progress. Account, draft event, and item-catalog
  foundations exist; event setup, public ordering, invitations, notifications,
  order operations, and reporting are not yet fully shipped.

## Summary

Aso Circle is a private, event-specific ordering and coordination product for aso ebi. It gives an organizer one place to publish the items available for an event, collect guest selections and fulfillment details, review proof of off-platform payment, and coordinate each order through fulfillment.

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
6. Keep guests informed through transactional email first and opt-in WhatsApp
   notifications before the complete MVP launch gate is declared met.
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

There is one account model. Organizer and attendee are event-scoped
relationships, not separate account types. Each event has exactly one owner in
the MVP. A user may own multiple events and may also participate as an attendee
at other events. The attendee relationship is implemented with the public event
and ordering work, not by the event-foundation slice alone.

### Guest

An invited attendee purchasing fabric, caps, or other event-specific items for themselves, a partner, or family members.

The organizer interface uses **Guests** as the plain-language label for invited
or participating attendees. Guests access an event through its private link and
must have an account before viewing payment instructions or submitting an
order.

## Product terminology and routes

- **Organizer** means the sole owner of an event. The product does not call this
  person a vendor, merchant, or administrator.
- **Guest** is the interface label for an invited or participating attendee.
  An invitation is outreach; an attendee relationship records participation.
- **Items** is the organizer label for the event catalog.
- The organizer workspace is rooted at `/events/[eventId]` and uses the stable
  navigation labels `Overview`, `Items`, `Guests`, `Orders`, and `Event setup`.
- A published event uses the unlisted public route `/e/[shareToken]`. Every
  invitation and normal share action uses that same private event link; the MVP
  does not issue invitation-specific access tokens.
- Event, payment, and fulfillment states remain separate state axes. The
  interface must not collapse them into an ambiguous generic order status.

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
- **FR-AUTH-6:** Organizer and attendee permissions are derived from their
  event-scoped relationships on the server. A caller-supplied user identifier
  never grants event access.

### Event management

- **FR-EVENT-1:** An organizer can create, edit, permanently delete a draft, publish, close, reopen, and archive an event.
- **FR-EVENT-2:** An event includes a name, description, date, location or location note, contact information, and optional uploaded cover image. When no valid upload exists, the product uses the standard Aso Circle event banner. The banner and uploaded cover are presented separately from event title text; neither requires embedded title text.
- **FR-EVENT-3:** An event uses exactly one organizer-selected currency, defaulting to NGN. The currency can change until the first catalog item is added and is locked afterward. The product does not convert currencies.
- **FR-EVENT-4:** An organizer must set an exact ordering-deadline timestamp and
  an IANA event time zone. The interface displays and interprets the deadline in
  that event time zone. When the exact deadline passes, new orders and guest
  edits are blocked. Existing date-only records remain drafts until the owner
  supplies an exact deadline and time zone.
- **FR-EVENT-5:** Closing an event immediately blocks new orders and guest edits without removing existing order access.
- **FR-EVENT-6:** Publishing requires a verified owner email, a non-guessable
  server-generated share token, a future exact deadline with a valid IANA time
  zone, at least one available visible item, external payment instructions, and
  at least one enabled fulfillment option. Readiness lists every unmet
  requirement rather than stopping after the first failure.
- **FR-EVENT-7:** Permanent deletion is available only for a draft event and atomically removes the event and its draft item catalog. Published, closed, and archived events cannot be permanently deleted.
- **FR-EVENT-8:** An uploaded cover must be a validated supported image within
  the configured size limit. Replacing or removing it also removes the prior
  stored file when safe to do so.

### Invitation management

- **FR-INVITE-1:** Invitations are organizer outreach and are not access
  control. A person with the normal private link may sign in and participate
  even when no invitation row exists.
- **FR-INVITE-2:** Organizers can prepare invitations manually, by CSV import,
  or by pasting rows. Invitation records contain name and email only for the
  MVP; phone numbers are not stored on invitation records.
- **FR-INVITE-3:** Invitation email addresses are trimmed and compared
  case-insensitively. There is at most one active invitation per normalized
  email per event. Duplicate rows within one import and duplicates of existing
  event invitations are reported explicitly and are not silently created or
  sent twice.
- **FR-INVITE-4:** CSV and pasted imports validate the supported name/email
  columns, report row-level errors, and produce created, skipped-duplicate, and
  invalid counts. Importing or editing an invitation never sends it
  automatically.
- **FR-INVITE-5:** An organizer explicitly chooses when to send or resend.
  Every attempt appends send history with its timestamp, result, and provider
  reference when available; a resend does not overwrite prior history.
- **FR-INVITE-6:** A signed-in user is matched to an invitation only when the
  account's verified email equals the normalized invited email. Matching helps
  organizers understand outreach and attendance but does not gate access to the
  private event link.

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
- **FR-FULFILL-6:** Capturing a delivery choice does not imply that Aso Circle books, performs, or guarantees delivery.

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
- **FR-NOTIFY-7:** Delivery is staged. Transactional email ships first.
  WhatsApp remains required before the complete current MVP launch gate is
  marked complete, but its later implementation must not block truthful status
  reporting for the email-first stage.

### Organizer dashboard and export

- **FR-DASH-1:** The dashboard summarizes item demand, reserved and remaining inventory, order value, payment states, and fulfillment states.
- **FR-DASH-2:** The organizer can search by order reference or guest and filter by item, payment status, fulfillment status, and fulfillment option.
- **FR-DASH-3:** The organizer can open an order to review line items, proof of payment, guest details, fulfillment information, notes, and status history.
- **FR-DASH-4:** The organizer can export the current filtered order set as CSV.
- **FR-DASH-5:** CSV output uses one row per order line and includes order reference, item, quantity, unit price, order total, guest details, fulfillment information, payment status, fulfillment status, and relevant timestamps.
- **FR-DASH-6:** Dashboard summaries, filters, and exports are scoped to one
  event. Cross-event reporting and portfolio analytics are not part of the MVP.

## State models

### Event

- `Draft`: Editable by the owner and unavailable to guests. It can be permanently deleted together with its draft item catalog.
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
- **NFR-9 — Accessibility and language:** Use plain international English and
  design for older adults as part of the standard experience, without a
  patronizing special mode. Public-event body text is at least 18px; organizer
  body and control text is at least 16px. Primary controls and inputs are at
  least 48px high, and other interactive targets are at least 44 by 44px.
  Forms use persistent labels, field-associated inline errors, and status cues
  that combine text with icons where icons are useful. Keyboard users receive
  visible focus. No required action is hover-only, and no critical outcome is
  communicated only by a transient toast.
- **NFR-10 — Responsiveness:** Guest ordering and organizer review must work on current mobile and desktop browsers, with mobile treated as a primary guest surface. Core flows must reflow without horizontal scrolling at 320 CSS pixels wide and remain usable at 200% browser zoom. Controls must not be hidden by device safe areas or the on-screen keyboard.
- **NFR-11 — Export security:** CSV exports must be generated only for the owner and must not be publicly addressable.
- **NFR-12 — Representative validation:** Before the MVP launch gate is marked
  complete, representative community members, including older adults and
  people who are less confident with digital ordering, validate the core setup,
  ordering, payment-proof, and status journeys. Findings are addressed without
  creating a separate or stigmatizing interface mode.

## Success criteria and launch gate

The MVP is validated when one real event completes the following lifecycle with Aso Circle as the operational source of truth. Shipping the transactional-email stage alone is progress toward this gate, not completion of the full gate:

1. The organizer independently creates and publishes the event.
2. Real guests submit receipt-backed orders through private links.
3. Inventory remains accurate with no duplicate reservations or overselling.
4. The organizer confirms or rejects payments from the dashboard.
5. Transactional email and connected, opted-in WhatsApp notifications reflect lifecycle changes. Email ships first; this item remains incomplete until the later WhatsApp stage is operational.
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
12. **Draft deletion:** An owner can permanently delete a draft event with catalog items, removing the event and its catalog atomically, while another user cannot delete it and a non-draft event is retained.

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
