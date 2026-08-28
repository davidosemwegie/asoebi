"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  LoaderCircleIcon,
  MinusIcon,
  PlusIcon,
  ReceiptTextIcon,
} from "lucide-react"

import { getAuthHref } from "@/lib/auth-continuation"
import { formatMoney } from "@/lib/money"
import {
  earliestIncompleteStep,
  missingRequiredFulfillmentFields,
  ORDER_STEPS,
  type OrderStep,
} from "@/lib/order-step-guards"
import { api } from "@workspace/backend/convex/_generated/api"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import { Textarea } from "@workspace/ui/components/textarea"

const labels: Record<OrderStep, string> = {
  items: "Choose items",
  fulfillment: "Pickup or delivery",
  details: "Your details",
  review: "Check your order",
  payment: "Payment and receipt",
}

type PendingEdit = {
  quantities?: Record<string, number>
  optionId?: string
  guestName?: string
  guestPhone?: string
  details?: Record<string, string>
  proofId?: string
  fileName?: string
  reviewed?: boolean
}

function requestId() {
  return crypto.randomUUID().replaceAll("-", "")
}

async function digestFile(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  let binary = ""
  for (const byte of new Uint8Array(hash)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function Stepper({
  shareToken,
  current,
  completeThrough,
}: {
  shareToken: string
  current: OrderStep
  completeThrough: number
}) {
  const currentIndex = ORDER_STEPS.indexOf(current)
  return (
    <nav aria-label="Order steps" className="pb-1">
      <ol className="flex flex-wrap gap-2 text-base">
        {ORDER_STEPS.map((step, index) => {
          const active = index === currentIndex
          const href = `/e/${shareToken}/order/${step}`
          return (
            <li key={step}>
              {index <= completeThrough || active ? (
                <Link
                  aria-current={active ? "step" : undefined}
                  href={href}
                  className="inline-flex min-h-11 items-center rounded-lg border px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {index + 1}. {labels[step]}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="inline-flex min-h-11 items-center rounded-lg border border-dashed px-3 text-muted-foreground"
                >
                  {index + 1}. {labels[step]}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function OrderFlow({
  shareToken,
  step,
}: {
  shareToken: string
  step: OrderStep
}) {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const startCheckout = useMutation(api.eventAttendees.startCheckout)
  const saveDraft = useMutation(api.checkout.saveDraft)
  const submit = useMutation(api.checkout.submit)
  const updatePending = useMutation(api.checkout.updatePending)
  const resubmitRejected = useMutation(api.checkout.resubmitRejected)
  const generateProofUploadUrl = useMutation(
    api.checkout.generateProofUploadUrl
  )
  const finalizeProof = useAction(api.proofUploads.finalize)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [optionId, setOptionId] = useState("")
  const [guestName, setGuestName] = useState("")
  const [guestPhone, setGuestPhone] = useState("")
  const [details, setDetails] = useState<Record<string, string>>({})
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({})
  const [proofId, setProofId] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [editHydrated, setEditHydrated] = useState(false)
  const [editReviewed, setEditReviewed] = useState(false)
  const submitRequestId = useRef<string | null>(null)
  const checkout = useQuery(api.checkout.get, joined ? { shareToken } : "skip")

  const pendingEditKey = checkout?.order
    ? `asoebi:order-edit:${checkout.order._id}`
    : null

  useEffect(() => {
    if (!isAuthenticated || joined) return
    void startCheckout({ shareToken })
      .then(() => setJoined(true))
      .catch(() => setError("This event is no longer accepting orders."))
  }, [isAuthenticated, joined, shareToken, startCheckout])

  useEffect(() => {
    if (!checkout?.order) return
    const next: Record<string, number> = {}
    for (const line of checkout.lines) next[line.itemId] = line.quantity
    const saved =
      checkout.order.lifecycle !== "draft" && pendingEditKey
        ? window.localStorage.getItem(pendingEditKey)
        : null
    let edit: PendingEdit | null = null
    try {
      edit = saved ? (JSON.parse(saved) as PendingEdit) : null
    } catch {
      if (pendingEditKey) window.localStorage.removeItem(pendingEditKey)
    }
    setQuantities(edit?.quantities ?? next)
    setOptionId(edit?.optionId ?? checkout.order.fulfillmentOptionId ?? "")
    setGuestName(edit?.guestName ?? checkout.order.guestName ?? "")
    setGuestPhone(edit?.guestPhone ?? checkout.order.guestPhone ?? "")
    setDetails(edit?.details ?? checkout.order.fulfillmentDetails ?? {})
    setFileName(edit?.fileName ?? null)
    setEditReviewed(edit?.reviewed ?? Boolean(checkout.order.reviewedAt))
    setProofId(
      edit?.proofId ??
        (checkout.order.paymentStatus === "rejected"
          ? null
          : (checkout.order.currentProofId ?? null))
    )
    setEditHydrated(true)
  }, [checkout?.order?._id, pendingEditKey])

  useEffect(() => {
    if (
      !editHydrated ||
      !pendingEditKey ||
      checkout?.order?.lifecycle === "draft"
    )
      return
    window.localStorage.setItem(
      pendingEditKey,
      JSON.stringify({
        quantities,
        optionId,
        guestName,
        guestPhone,
        details,
        proofId,
        fileName,
        reviewed: editReviewed,
      })
    )
  }, [
    checkout?.order?.lifecycle,
    details,
    editHydrated,
    editReviewed,
    fileName,
    guestName,
    guestPhone,
    optionId,
    pendingEditKey,
    proofId,
    quantities,
  ])

  const lines = useMemo(
    () =>
      checkout?.items
        .map((item) => ({ item, quantity: quantities[item._id] ?? 0 }))
        .filter((line) => line.quantity > 0) ?? [],
    [checkout?.items, quantities]
  )
  const selectedOption = checkout?.fulfillmentOptions.find(
    (option) => option._id === optionId
  )
  const proposal = useMemo(() => {
    const existing = new Map(checkout?.lines.map((line) => [line.itemId, line]))
    const nextLines = lines.map(({ item, quantity }) => {
      const old = existing.get(item._id)
      const unitPriceMinor = old?.unitPriceMinor ?? item.priceMinor
      return {
        itemName: old?.itemName ?? item.name,
        unitLabel: old?.unitLabel ?? item.unitLabel,
        quantity,
        unitPriceMinor,
        lineTotalMinor: unitPriceMinor * quantity,
      }
    })
    const subtotal = nextLines.reduce(
      (sum, line) => sum + line.lineTotalMinor,
      0
    )
    const fee =
      checkout?.order?.fulfillmentOptionId === optionId
        ? (checkout?.order?.fulfillmentFeeMinor ?? 0)
        : (selectedOption?.feeMinor ?? 0)
    return {
      lines: nextLines,
      fulfillmentFeeMinor: fee,
      totalMinor: subtotal + fee,
    }
  }, [
    checkout?.lines,
    checkout?.order?.fulfillmentFeeMinor,
    checkout?.order?.fulfillmentOptionId,
    lines,
    optionId,
    selectedOption?.feeMinor,
  ])
  const setDetail = (field: string, value: string) => {
    setEditReviewed(false)
    setDetails((old) => ({ ...old, [field]: value }))
    setDetailErrors((old) => {
      const rest = { ...old }
      delete rest[field]
      return rest
    })
  }
  const completeThrough = checkout
    ? Math.max(
        0,
        ORDER_STEPS.indexOf(
          earliestIncompleteStep({
            lines,
            fulfillmentOptionId: optionId,
            guestName,
            reviewedAt: editReviewed ? 1 : undefined,
            fulfillmentRequiredFields: selectedOption?.requiredFields,
            fulfillmentDetails: details,
          })
        )
      )
    : 0

  useEffect(() => {
    if (!checkout?.order || !editHydrated || step === "items") return
    const earliest = earliestIncompleteStep({
      lines,
      fulfillmentOptionId: optionId,
      guestName,
      reviewedAt: editReviewed ? 1 : undefined,
      fulfillmentRequiredFields: selectedOption?.requiredFields,
      fulfillmentDetails: details,
    })
    if (ORDER_STEPS.indexOf(step) > ORDER_STEPS.indexOf(earliest))
      router.replace(`/e/${shareToken}/order/${earliest}`)
  }, [
    checkout?.order,
    details,
    editHydrated,
    editReviewed,
    guestName,
    lines,
    optionId,
    router,
    selectedOption?.requiredFields,
    shareToken,
    step,
  ])

  useEffect(() => {
    if (
      checkout?.order?.paymentStatus !== "pending_review" ||
      proposal.totalMinor === checkout.order.totalMinor ||
      proofId !== checkout.order.currentProofId
    )
      return
    setProofId(null)
    if (pendingEditKey) {
      const saved = window.localStorage.getItem(pendingEditKey)
      const edit = saved ? (JSON.parse(saved) as Record<string, unknown>) : {}
      delete edit.proofId
      window.localStorage.setItem(pendingEditKey, JSON.stringify(edit))
    }
  }, [checkout?.order, pendingEditKey, proofId, proposal.totalMinor])

  if (error && isAuthenticated && !joined)
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4 py-8 text-lg">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl">Ordering is unavailable</CardTitle>
            <CardDescription className="text-lg">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              nativeButton={false}
              render={<Link href="/" />}
              className="min-h-12 text-lg"
            >
              Go to My orders
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  if (authLoading || (isAuthenticated && !joined) || checkout === undefined)
    return (
      <main
        className="mx-auto min-h-dvh max-w-3xl px-4 py-8 text-lg"
        aria-busy="true"
      >
        Loading your order…
      </main>
    )
  if (!isAuthenticated)
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4 py-8">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in to order</CardTitle>
            <CardDescription className="text-lg">
              Sign in or create an account to continue with this private event.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              nativeButton={false}
              render={
                <Link
                  href={getAuthHref("/login", `/e/${shareToken}/order/${step}`)}
                />
              }
              className="min-h-12 text-lg"
            >
              Sign in to continue
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  if (!checkout)
    return (
      <main className="mx-auto min-h-dvh max-w-xl px-4 py-8 text-lg">
        This event is unavailable.
      </main>
    )

  const persist = async (nextStep: OrderStep, reviewed = false) => {
    setError(null)
    const missing =
      nextStep === "review"
        ? missingRequiredFulfillmentFields(
            selectedOption?.requiredFields,
            details
          )
        : []
    if (missing.length) {
      const nextErrors = Object.fromEntries(
        missing.map((field) => [
          field,
          "This field is required for this option.",
        ])
      )
      setDetailErrors(nextErrors)
      setError("Complete the required details before continuing.")
      requestAnimationFrame(() =>
        document.getElementById(`detail-${missing[0]}`)?.focus()
      )
      return
    }
    setPending(true)
    try {
      if (checkout.order?.lifecycle !== "draft") {
        setEditReviewed(reviewed)
        if (pendingEditKey)
          window.localStorage.setItem(
            pendingEditKey,
            JSON.stringify({
              quantities,
              optionId,
              guestName,
              guestPhone,
              details,
              proofId,
              fileName,
              reviewed,
            })
          )
        router.push(`/e/${shareToken}/order/${nextStep}`)
        return
      }
      await saveDraft({
        shareToken,
        lines: lines.map(({ item, quantity }) => ({
          itemId: item._id,
          quantity,
        })),
        fulfillment: optionId
          ? { optionId: optionId as never, ...details }
          : undefined,
        guestName,
        guestPhone: guestPhone || undefined,
        reviewed,
      })
      router.push(`/e/${shareToken}/order/${nextStep}`)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "We could not save your order."
      )
    } finally {
      setPending(false)
    }
  }

  const uploadProof = async (file: File | undefined) => {
    setFileError(null)
    if (!file) return
    setFileName(file.name)
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type))
      return setFileError("Choose a JPEG, PNG, or PDF payment receipt.")
    if (file.size > 10 * 1024 * 1024)
      return setFileError("Choose a payment receipt no larger than 10 MB.")
    setPending(true)
    try {
      const sha256 = await digestFile(file)
      const claim = await generateProofUploadUrl({
        shareToken,
        contentType: file.type,
        size: file.size,
        sha256,
      })
      const response = await fetch(claim.uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      const uploaded = (await response.json()) as { storageId?: string }
      if (!response.ok || !uploaded.storageId)
        throw new Error("The receipt upload did not finish.")
      const finalized = await finalizeProof({
        claimId: claim.claimId,
        storageId: uploaded.storageId as never,
      })
      if (!finalized.ok) throw new Error(finalized.message)
      setProofId(finalized.proofId)
      if (pendingEditKey) {
        const saved = window.localStorage.getItem(pendingEditKey)
        const draft = saved
          ? (JSON.parse(saved) as Record<string, unknown>)
          : {}
        window.localStorage.setItem(
          pendingEditKey,
          JSON.stringify({
            ...draft,
            proofId: finalized.proofId,
            fileName: file.name,
          })
        )
      }
    } catch (cause) {
      setFileError(
        cause instanceof Error
          ? cause.message
          : "We could not upload that receipt."
      )
    } finally {
      setPending(false)
    }
  }

  const submitOrder = async () => {
    if (!proofId) {
      setFileError("Upload your payment receipt before submitting.")
      return
    }
    setError(null)
    setPending(true)
    try {
      submitRequestId.current ??= requestId()
      const payload = {
        shareToken,
        requestId: submitRequestId.current,
        lines: lines.map(({ item, quantity }) => ({
          itemId: item._id,
          quantity,
        })),
        fulfillment: { optionId: optionId as never, ...details },
        guestName,
        guestPhone: guestPhone || undefined,
      }
      const orderId =
        checkout.order?.paymentStatus === "pending_review"
          ? await updatePending({ ...payload, proofId: proofId as never })
          : checkout.order?.paymentStatus === "rejected"
            ? await resubmitRejected({ ...payload, proofId: proofId as never })
            : await submit({ ...payload, proofId: proofId as never })
      submitRequestId.current = null
      if (pendingEditKey) window.localStorage.removeItem(pendingEditKey)
      router.replace(`/e/${shareToken}/order/confirmation?orderId=${orderId}`)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We could not submit your order."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="min-h-dvh bg-muted/30 px-4 py-6 text-lg leading-relaxed">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header>
          <p className="font-medium">
            Step {ORDER_STEPS.indexOf(step) + 1} of 5
          </p>
          <h1 className="font-heading text-3xl font-semibold">
            {labels[step]}
          </h1>
        </header>
        <Stepper
          shareToken={shareToken}
          current={step}
          completeThrough={completeThrough}
        />
        {error ? (
          <Alert variant="destructive" aria-live="polite">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Could not continue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {step === "items" ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p>Choose the items and quantities you need.</p>
              {checkout.items.map((item) => (
                <div
                  key={item._id}
                  className="flex items-center justify-between gap-3 border-b pb-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-muted-foreground">
                      {formatMoney(item.priceMinor, checkout.event.currency)}{" "}
                      per {item.unitLabel} · {item.availableQuantity} available
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="size-11"
                      aria-label={`Reduce ${item.name} quantity`}
                      onClick={() => {
                        setEditReviewed(false)
                        setQuantities((old) => ({
                          ...old,
                          [item._id]: Math.max(0, (old[item._id] ?? 0) - 1),
                        }))
                      }}
                    >
                      <MinusIcon aria-hidden="true" />
                    </Button>
                    <span className="w-8 text-center tabular-nums">
                      {quantities[item._id] ?? 0}
                    </span>
                    <Button
                      variant="outline"
                      className="size-11"
                      aria-label={`Increase ${item.name} quantity`}
                      disabled={
                        (quantities[item._id] ?? 0) >= item.availableQuantity
                      }
                      onClick={() => {
                        setEditReviewed(false)
                        setQuantities((old) => ({
                          ...old,
                          [item._id]: (old[item._id] ?? 0) + 1,
                        }))
                      }}
                    >
                      <PlusIcon aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                className="min-h-12 w-full"
                disabled={pending || lines.length === 0}
                onClick={() => void persist("fulfillment")}
              >
                Continue to Pickup or delivery
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {step === "fulfillment" ? (
          <Card>
            <CardContent className="space-y-5 pt-6">
              <RadioGroup
                value={optionId}
                onValueChange={(value) => {
                  setEditReviewed(false)
                  setOptionId(value)
                }}
              >
                {checkout.fulfillmentOptions.map((option) => (
                  <Label
                    key={option._id}
                    htmlFor={option._id}
                    className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-4"
                  >
                    <RadioGroupItem id={option._id} value={option._id} />
                    <span>
                      <span className="block font-semibold">{option.name}</span>
                      <span className="block text-muted-foreground">
                        {formatMoney(option.feeMinor, checkout.event.currency)}{" "}
                        · {option.instructions}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              <Button
                className="min-h-12 w-full"
                disabled={pending || !optionId}
                onClick={() => void persist("details")}
              >
                Continue to Your details
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {step === "details" ? (
          <Card>
            <CardContent className="pt-6">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="guest-name">Your name</FieldLabel>
                  <Input
                    id="guest-name"
                    className="min-h-12 text-lg"
                    required
                    value={guestName}
                    onChange={(event) => {
                      setEditReviewed(false)
                      setGuestName(event.target.value)
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="guest-phone">Phone number</FieldLabel>
                  <Input
                    id="guest-phone"
                    className="min-h-12 text-lg"
                    value={guestPhone}
                    onChange={(event) => {
                      setEditReviewed(false)
                      setGuestPhone(event.target.value)
                    }}
                  />
                </Field>
                {selectedOption?.type === "pickup" ? (
                  <Field data-invalid={Boolean(detailErrors.pickupContact)}>
                    <FieldLabel htmlFor="pickup-contact">
                      Pickup contact
                      {selectedOption.requiredFields.kind === "pickup" &&
                      selectedOption.requiredFields.pickupContact
                        ? " (required)"
                        : ""}
                    </FieldLabel>
                    <Input
                      id="detail-pickupContact"
                      className="min-h-12 text-lg"
                      required={
                        selectedOption.requiredFields.kind === "pickup" &&
                        selectedOption.requiredFields.pickupContact
                      }
                      value={details.pickupContact ?? ""}
                      aria-invalid={Boolean(detailErrors.pickupContact)}
                      aria-describedby={
                        detailErrors.pickupContact
                          ? "detail-pickupContact-error"
                          : undefined
                      }
                      onChange={(event) =>
                        setDetail("pickupContact", event.target.value)
                      }
                    />
                    <FieldError id="detail-pickupContact-error">
                      {detailErrors.pickupContact}
                    </FieldError>
                  </Field>
                ) : (
                  <>
                    <Field data-invalid={Boolean(detailErrors.recipientName)}>
                      <FieldLabel htmlFor="recipient-name">
                        Recipient name
                        {selectedOption?.requiredFields.kind === "delivery" &&
                        selectedOption.requiredFields.recipientName
                          ? " (required)"
                          : ""}
                      </FieldLabel>
                      <Input
                        id="detail-recipientName"
                        className="min-h-12 text-lg"
                        required={
                          selectedOption?.requiredFields.kind === "delivery" &&
                          selectedOption.requiredFields.recipientName
                        }
                        value={details.recipientName ?? ""}
                        aria-invalid={Boolean(detailErrors.recipientName)}
                        aria-describedby={
                          detailErrors.recipientName
                            ? "detail-recipientName-error"
                            : undefined
                        }
                        onChange={(event) =>
                          setDetail("recipientName", event.target.value)
                        }
                      />
                      <FieldError id="detail-recipientName-error">
                        {detailErrors.recipientName}
                      </FieldError>
                    </Field>
                    <Field data-invalid={Boolean(detailErrors.phoneNumber)}>
                      <FieldLabel htmlFor="delivery-phone">
                        Delivery phone number
                        {selectedOption?.requiredFields.kind === "delivery" &&
                        selectedOption.requiredFields.phoneNumber
                          ? " (required)"
                          : ""}
                      </FieldLabel>
                      <Input
                        id="detail-phoneNumber"
                        className="min-h-12 text-lg"
                        required={
                          selectedOption?.requiredFields.kind === "delivery" &&
                          selectedOption.requiredFields.phoneNumber
                        }
                        value={details.phoneNumber ?? ""}
                        aria-invalid={Boolean(detailErrors.phoneNumber)}
                        aria-describedby={
                          detailErrors.phoneNumber
                            ? "detail-phoneNumber-error"
                            : undefined
                        }
                        onChange={(event) =>
                          setDetail("phoneNumber", event.target.value)
                        }
                      />
                      <FieldError id="detail-phoneNumber-error">
                        {detailErrors.phoneNumber}
                      </FieldError>
                    </Field>
                    <Field data-invalid={Boolean(detailErrors.address)}>
                      <FieldLabel htmlFor="address">
                        Delivery address
                        {selectedOption?.requiredFields.kind === "delivery" &&
                        selectedOption.requiredFields.address
                          ? " (required)"
                          : ""}
                      </FieldLabel>
                      <Textarea
                        id="detail-address"
                        className="min-h-24 text-lg"
                        required={
                          selectedOption?.requiredFields.kind === "delivery" &&
                          selectedOption.requiredFields.address
                        }
                        value={details.address ?? ""}
                        aria-invalid={Boolean(detailErrors.address)}
                        aria-describedby={
                          detailErrors.address
                            ? "detail-address-error"
                            : undefined
                        }
                        onChange={(event) =>
                          setDetail("address", event.target.value)
                        }
                      />
                      <FieldError id="detail-address-error">
                        {detailErrors.address}
                      </FieldError>
                    </Field>
                    <Field data-invalid={Boolean(detailErrors.availability)}>
                      <FieldLabel htmlFor="availability">
                        Delivery availability
                        {selectedOption?.requiredFields.kind === "delivery" &&
                        selectedOption.requiredFields.availability
                          ? " (required)"
                          : ""}
                      </FieldLabel>
                      <Textarea
                        id="detail-availability"
                        className="min-h-24 text-lg"
                        required={
                          selectedOption?.requiredFields.kind === "delivery" &&
                          selectedOption.requiredFields.availability
                        }
                        value={details.availability ?? ""}
                        aria-invalid={Boolean(detailErrors.availability)}
                        aria-describedby={
                          detailErrors.availability
                            ? "detail-availability-error"
                            : undefined
                        }
                        onChange={(event) =>
                          setDetail("availability", event.target.value)
                        }
                      />
                      <FieldError id="detail-availability-error">
                        {detailErrors.availability}
                      </FieldError>
                    </Field>
                    <Field data-invalid={Boolean(detailErrors.notes)}>
                      <FieldLabel htmlFor="notes">
                        Delivery notes
                        {selectedOption?.requiredFields.kind === "delivery" &&
                        selectedOption.requiredFields.notes
                          ? " (required)"
                          : ""}
                      </FieldLabel>
                      <Textarea
                        id="detail-notes"
                        className="min-h-24 text-lg"
                        required={
                          selectedOption?.requiredFields.kind === "delivery" &&
                          selectedOption.requiredFields.notes
                        }
                        value={details.notes ?? ""}
                        aria-invalid={Boolean(detailErrors.notes)}
                        aria-describedby={
                          detailErrors.notes ? "detail-notes-error" : undefined
                        }
                        onChange={(event) =>
                          setDetail("notes", event.target.value)
                        }
                      />
                      <FieldError id="detail-notes-error">
                        {detailErrors.notes}
                      </FieldError>
                    </Field>
                  </>
                )}
                <Button
                  className="min-h-12 w-full"
                  disabled={pending || !guestName.trim()}
                  onClick={() => void persist("review")}
                >
                  Continue to Check your order
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        ) : null}
        {step === "review" ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h2 className="font-heading text-xl font-semibold">
                Check your order
              </h2>
              <ul className="space-y-2">
                {proposal.lines.map((line) => (
                  <li
                    key={line.itemName}
                    className="flex justify-between gap-3"
                  >
                    <span>
                      {line.itemName} × {line.quantity}
                    </span>
                    <span>
                      {formatMoney(
                        line.lineTotalMinor,
                        checkout.event.currency
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p>
                Fulfillment:{" "}
                {formatMoney(
                  proposal.fulfillmentFeeMinor,
                  checkout.event.currency
                )}
              </p>
              <p className="font-semibold">
                Total:{" "}
                {formatMoney(proposal.totalMinor, checkout.event.currency)}
              </p>
              <Button
                className="min-h-12 w-full"
                disabled={pending}
                onClick={() => void persist("payment", true)}
              >
                Continue to Payment and receipt
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {step === "payment" ? (
          <Card>
            <CardContent className="space-y-5 pt-6">
              <h2 className="font-heading text-xl font-semibold">
                Payment and receipt
              </h2>
              {checkout.paymentInstructions ? (
                <p className="whitespace-pre-wrap">
                  {checkout.paymentInstructions}
                </p>
              ) : (
                <Alert>
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertTitle>Payment instructions are unavailable</AlertTitle>
                  <AlertDescription>
                    Ask the organizer to update this event before you submit.
                  </AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="payment-receipt">
                  Payment receipt
                </FieldLabel>
                <p
                  id="payment-receipt-guidance"
                  className="text-lg text-muted-foreground"
                >
                  JPEG, PNG, or PDF; maximum 10 MB.
                </p>
                <Input
                  id="payment-receipt"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="min-h-12 text-lg"
                  aria-invalid={Boolean(fileError)}
                  aria-describedby={`${fileError ? "payment-receipt-error " : ""}payment-receipt-guidance`}
                  onChange={(event) =>
                    void uploadProof(event.target.files?.[0])
                  }
                />
                {fileName ? (
                  <p className="text-lg">Selected: {fileName}</p>
                ) : null}
                <FieldError id="payment-receipt-error">{fileError}</FieldError>
              </Field>
              {proofId ? (
                <Alert>
                  <CheckCircle2Icon aria-hidden="true" />
                  <AlertTitle>Receipt ready</AlertTitle>
                  <AlertDescription>
                    Your receipt is ready to submit.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Button
                className="min-h-12 w-full"
                disabled={pending || !proofId || !checkout.paymentInstructions}
                onClick={() => void submitOrder()}
              >
                {pending ? (
                  <LoaderCircleIcon
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ReceiptTextIcon aria-hidden="true" />
                )}
                Submit order
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  )
}
