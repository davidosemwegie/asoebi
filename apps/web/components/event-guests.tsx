"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  Clock3Icon,
  Edit3Icon,
  FileUpIcon,
  LoaderCircleIcon,
  MailCheckIcon,
  MailIcon,
  MailWarningIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldAlertIcon,
  ShoppingBagIcon,
} from "lucide-react"

import {
  EventInvitationSheet,
  type InvitationEditorInvitation,
} from "@/components/event-invitation-sheet"
import { useEventWorkspace } from "@/components/event-workspace"
import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Input } from "@workspace/ui/components/input"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

type DeliveryState =
  | "not_sent"
  | "queued"
  | "sent"
  | "delivered"
  | "delayed"
  | "failed"
  | "suppressed"

type Activity =
  | "not_started"
  | "checkout_started"
  | "order_submitted"
  | "order_completed"

type Invitation = InvitationEditorInvitation & {
  activity: Activity
  createdAt: number
  currentNotificationId?: Id<"notifications">
  latestDeliveryState: DeliveryState
  latestSentAt?: number
  source: "manual" | "csv" | "paste"
  updatedAt: number
}

type Feedback = {
  message: string
  title: string
  type: "error" | "success"
} | null
type PendingActionRequest = {
  action: "retry" | "send"
  invitationIds: Id<"eventInvitations">[]
  resend: boolean
}
type PendingDialog = (PendingActionRequest & { requestId: string }) | null
type EditorState = {
  getReturnFocus: () => HTMLElement | null
  invitation: Invitation | null
  session: number
}

const DELIVERY_FILTERS: Array<{ label: string; value: DeliveryState | "all" }> =
  [
    { label: "All delivery states", value: "all" },
    { label: "Not sent", value: "not_sent" },
    { label: "Sending", value: "queued" },
    { label: "Sent", value: "sent" },
    { label: "Delivered", value: "delivered" },
    { label: "Delayed — needs attention", value: "delayed" },
    { label: "Failed — needs attention", value: "failed" },
    { label: "Do not resend", value: "suppressed" },
  ]

const ACTIVITY_FILTERS: Array<{ label: string; value: Activity | "all" }> = [
  { label: "All order activity", value: "all" },
  { label: "Not started", value: "not_started" },
  { label: "Order started", value: "checkout_started" },
  { label: "Order submitted", value: "order_submitted" },
  { label: "Order completed", value: "order_completed" },
]

const inputClassName = "min-h-12 text-base"
const actionClassName = "min-h-11 px-4 text-base"
const primaryActionClassName = "min-h-12 px-4 text-base"

function formatDateTime(timestamp: number | undefined) {
  if (!timestamp) return "Not sent yet"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp)
}

function DeliveryBadge({ state }: { state: DeliveryState }) {
  const copy = {
    not_sent: {
      icon: MailIcon,
      label: "Not sent",
      variant: "outline" as const,
    },
    queued: {
      icon: Clock3Icon,
      label: "Sending",
      variant: "secondary" as const,
    },
    sent: { icon: MailCheckIcon, label: "Sent", variant: "secondary" as const },
    delivered: {
      icon: CheckCircle2Icon,
      label: "Delivered",
      variant: "secondary" as const,
    },
    delayed: {
      icon: MailWarningIcon,
      label: "Needs attention",
      variant: "destructive" as const,
    },
    failed: {
      icon: CircleAlertIcon,
      label: "Needs attention",
      variant: "destructive" as const,
    },
    suppressed: {
      icon: ShieldAlertIcon,
      label: "Do not resend",
      variant: "destructive" as const,
    },
  }[state]
  const Icon = copy.icon

  return (
    <Badge variant={copy.variant} className="h-7 gap-1.5 text-sm">
      <Icon aria-hidden="true" className="size-3.5" />
      {copy.label}
    </Badge>
  )
}

function ActivityBadge({ activity }: { activity: Activity }) {
  const label = {
    not_started: "Not started",
    checkout_started: "Order started",
    order_submitted: "Order submitted",
    order_completed: "Order completed",
  }[activity]
  return (
    <Badge variant="outline" className="h-7 gap-1.5 text-sm">
      <ShoppingBagIcon aria-hidden="true" className="size-3.5" />
      {label}
    </Badge>
  )
}

type RowAction =
  | { kind: "action"; action: "retry" | "send"; label: string; resend: boolean }
  | { kind: "status"; copy: string }

function rowAction(invitation: Invitation): RowAction {
  if (invitation.latestDeliveryState === "not_sent") {
    return { kind: "action", action: "send", label: "Send", resend: false }
  }
  if (
    invitation.latestDeliveryState === "failed" ||
    invitation.latestDeliveryState === "delayed"
  ) {
    return { kind: "action", action: "retry", label: "Retry", resend: false }
  }
  if (invitation.latestDeliveryState === "queued") {
    return {
      kind: "status",
      copy: "Already sending. Wait for the delivery status to update.",
    }
  }
  if (invitation.latestDeliveryState === "suppressed") {
    return {
      kind: "status",
      copy: "Correct the email address before sending another invitation.",
    }
  }
  return { kind: "action", action: "send", label: "Resend", resend: true }
}

function GuestActions({
  invitation,
  onEdit,
  onRequestAction,
}: {
  invitation: Invitation
  onEdit: (invitation: Invitation, trigger: HTMLElement | null) => void
  onRequestAction: (action: PendingActionRequest) => void
}) {
  const editRef = useRef<HTMLButtonElement>(null)
  const sendRef = useRef<HTMLButtonElement>(null)
  const action = rowAction(invitation)

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        ref={editRef}
        type="button"
        variant="outline"
        className={actionClassName}
        onClick={() => onEdit(invitation, editRef.current)}
      >
        <Edit3Icon aria-hidden="true" /> Edit
      </Button>
      {action.kind === "action" ? (
        <Button
          ref={sendRef}
          type="button"
          variant={action.label === "Retry" ? "outline" : "default"}
          className={actionClassName}
          onClick={() =>
            onRequestAction({
              action: action.action,
              invitationIds: [invitation._id],
              resend: action.resend,
            })
          }
        >
          {action.label === "Retry" ? (
            <RefreshCwIcon aria-hidden="true" />
          ) : (
            <SendIcon aria-hidden="true" />
          )}
          {action.label}
        </Button>
      ) : (
        <span className="max-w-56 text-right text-base text-muted-foreground">
          {action.copy}
        </span>
      )}
    </div>
  )
}

export function EventGuests() {
  const event = useEventWorkspace()
  const sendInvitations = useMutation(api.eventInvitations.send)
  const retryInvitations = useMutation(api.eventInvitations.retry)
  const [search, setSearch] = useState("")
  const [deliveryState, setDeliveryState] = useState<DeliveryState | "all">(
    "all"
  )
  const [activity, setActivity] = useState<Activity | "all">("all")
  const [cursor, setCursor] = useState<string | null>(null)
  const [previousCursors, setPreviousCursors] = useState<(string | null)[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<Id<"eventInvitations">>>(
    () => new Set()
  )
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [pendingDialog, setPendingDialog] = useState<PendingDialog>(null)
  const [pendingAction, setPendingAction] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const editorSession = useRef(0)
  const addButtonRef = useRef<HTMLButtonElement>(null)

  const response = useQuery(api.eventInvitations.list, {
    eventId: event._id,
    paginationOpts: { cursor, numItems: 25 },
    search: search.trim() || undefined,
    deliveryState: deliveryState === "all" ? undefined : deliveryState,
    activity: activity === "all" ? undefined : activity,
  })
  const invitations = useMemo(
    () => (response?.page ?? []) as Invitation[],
    [response?.page]
  )
  const isLoading = response === undefined
  const selectedInvitations = useMemo(
    () => invitations.filter((invitation) => selectedIds.has(invitation._id)),
    [invitations, selectedIds]
  )
  const defaultSelectable = invitations.filter(
    (invitation) => invitation.latestDeliveryState === "not_sent"
  )
  const canBulkSend =
    selectedInvitations.length > 0 &&
    selectedInvitations.every((item) => item.latestDeliveryState === "not_sent")
  const canBulkRetry =
    selectedInvitations.length > 0 &&
    selectedInvitations.every((item) =>
      ["failed", "delayed"].includes(item.latestDeliveryState)
    )
  const canBulkResend =
    selectedInvitations.length > 0 &&
    selectedInvitations.every((item) =>
      ["sent", "delivered"].includes(item.latestDeliveryState)
    )
  const selectionHelp =
    selectedInvitations.length === 0
      ? null
      : canBulkSend
        ? "These guests are ready to receive the private event link."
        : canBulkRetry
          ? "These invitations need another delivery attempt."
          : canBulkResend
            ? "Resending sends another email to each selected guest."
            : selectedInvitations.every(
                  (item) => item.latestDeliveryState === "queued"
                )
              ? "These invitations are already sending. Wait for their delivery status to update."
              : selectedInvitations.every(
                    (item) => item.latestDeliveryState === "suppressed"
                  )
                ? "Correct these email addresses before sending another invitation."
                : "This selection includes incompatible invitation states. Select guests that are ready to send, retry, or resend together."
  function resetPagination() {
    setCursor(null)
    setPreviousCursors([])
    setSelectedIds(new Set())
  }

  function openEditor(
    invitation: Invitation | null,
    trigger: HTMLElement | null
  ) {
    editorSession.current += 1
    setEditor({
      getReturnFocus: () =>
        invitation ? trigger : (addButtonRef.current ?? trigger),
      invitation,
      session: editorSession.current,
    })
  }

  function updateSelection(
    invitationId: Id<"eventInvitations">,
    checked: boolean
  ) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(invitationId)
      else next.delete(invitationId)
      return next
    })
  }

  function selectCurrentPage(invitationsToSelect: Invitation[]) {
    setSelectedIds(
      new Set(invitationsToSelect.map((invitation) => invitation._id))
    )
  }

  function openActionDialog(request: PendingActionRequest) {
    setPendingDialog({ ...request, requestId: crypto.randomUUID() })
  }

  async function runPendingAction() {
    if (!pendingDialog || pendingAction) return
    setPendingAction(true)
    setFeedback(null)
    try {
      const result =
        pendingDialog.action === "retry"
          ? await retryInvitations({
              eventId: event._id,
              invitationIds: pendingDialog.invitationIds,
              requestId: pendingDialog.requestId,
            })
          : await sendInvitations({
              eventId: event._id,
              invitationIds: pendingDialog.invitationIds,
              requestId: pendingDialog.requestId,
              resend: pendingDialog.resend,
            })
      const queued = result.filter(
        (item) => item.outcome === "queued" || item.outcome === "retried"
      ).length
      const blocked = result.filter((item) => item.outcome === "blocked").length
      setFeedback({
        type: blocked > 0 ? "error" : "success",
        title:
          blocked > 0
            ? "Some guests need attention"
            : "Invitation request saved",
        message:
          blocked > 0
            ? `${queued} invitation${queued === 1 ? " was" : "s were"} queued. ${blocked} guest${blocked === 1 ? " needs" : "s need"} an email correction before sending again.`
            : `${queued} invitation${queued === 1 ? " was" : "s were"} queued for delivery.`,
      })
      setSelectedIds(new Set())
      setPendingDialog(null)
    } catch {
      setFeedback({
        type: "error",
        title: "Invitation request not saved",
        message: "We couldn't queue those invitations. Try again.",
      })
    } finally {
      setPendingAction(false)
    }
  }

  const dialogCount = pendingDialog?.invitationIds.length ?? 0
  const isRetryDialog = pendingDialog?.action === "retry"
  const isResendDialog = pendingDialog?.resend

  return (
    <section
      className="space-y-6 text-base"
      aria-labelledby="guest-invitations-heading"
    >
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="max-w-3xl space-y-2">
          <h2
            id="guest-invitations-heading"
            className="font-heading text-2xl font-semibold text-balance"
          >
            Guest invitations
          </h2>
          <p className="text-base leading-7 text-pretty text-muted-foreground">
            Add guest email addresses and send the private event link. Anyone
            with the link can view the event page.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className={primaryActionClassName}
            nativeButton={false}
            render={<Link href={`/events/${event._id}/guests/import`} />}
          >
            <FileUpIcon aria-hidden="true" /> Import guests
          </Button>
          <Button
            ref={addButtonRef}
            type="button"
            className={primaryActionClassName}
            onClick={() => openEditor(null, addButtonRef.current)}
          >
            <PlusIcon aria-hidden="true" /> Add guest
          </Button>
        </div>
      </div>

      {feedback ? (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
          className="text-base"
        >
          {feedback.type === "error" ? (
            <CircleAlertIcon aria-hidden="true" />
          ) : (
            <CheckCircle2Icon aria-hidden="true" />
          )}
          <AlertTitle>{feedback.title}</AlertTitle>
          <AlertDescription className="text-base">
            {feedback.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_15rem]">
        <div>
          <label htmlFor="guest-search" className="mb-2 block font-medium">
            Search guests
          </label>
          <Input
            id="guest-search"
            value={search}
            onChange={(changeEvent) => {
              resetPagination()
              setSearch(changeEvent.target.value)
            }}
            placeholder="Search by name or email"
            className={inputClassName}
          />
        </div>
        <div>
          <label
            htmlFor="guest-delivery-filter"
            className="mb-2 block font-medium"
          >
            Invitation status
          </label>
          <Select
            value={deliveryState}
            onValueChange={(value) => {
              resetPagination()
              setDeliveryState(value as DeliveryState | "all")
            }}
          >
            <SelectTrigger
              id="guest-delivery-filter"
              className="min-h-12 w-full text-base"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELIVERY_FILTERS.map((filter) => (
                <SelectItem
                  key={filter.value}
                  value={filter.value}
                  className="min-h-11 text-base"
                >
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label
            htmlFor="guest-activity-filter"
            className="mb-2 block font-medium"
          >
            Order activity
          </label>
          <Select
            value={activity}
            onValueChange={(value) => {
              resetPagination()
              setActivity(value as Activity | "all")
            }}
          >
            <SelectTrigger
              id="guest-activity-filter"
              className="min-h-12 w-full text-base"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_FILTERS.map((filter) => (
                <SelectItem
                  key={filter.value}
                  value={filter.value}
                  className="min-h-11 text-base"
                >
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {invitations.length > 0 ? (
        <Card className="gap-3 p-4 text-base">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="font-medium">{selectedIds.size} selected</p>
              <p className="text-base text-muted-foreground">
                Selection covers this page only. Already-sent invitations are
                excluded from the default selection.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className={actionClassName}
                onClick={() => selectCurrentPage(defaultSelectable)}
              >
                Select not sent on this page
              </Button>
              <Button
                type="button"
                variant="outline"
                className={actionClassName}
                onClick={() => selectCurrentPage(invitations)}
              >
                Select all on this page
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={actionClassName}
                onClick={() => setSelectedIds(new Set())}
                disabled={selectedIds.size === 0}
              >
                Clear selection
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              className={primaryActionClassName}
              disabled={!canBulkSend}
              onClick={() =>
                openActionDialog({
                  action: "send",
                  invitationIds: selectedInvitations.map((item) => item._id),
                  resend: false,
                })
              }
            >
              <SendIcon aria-hidden="true" /> Send selected
            </Button>
            <Button
              type="button"
              variant="outline"
              className={primaryActionClassName}
              disabled={!canBulkRetry}
              onClick={() =>
                openActionDialog({
                  action: "retry",
                  invitationIds: selectedInvitations.map((item) => item._id),
                  resend: false,
                })
              }
            >
              <RefreshCwIcon aria-hidden="true" /> Retry selected
            </Button>
            <Button
              type="button"
              variant="outline"
              className={primaryActionClassName}
              disabled={!canBulkResend}
              onClick={() =>
                openActionDialog({
                  action: "send",
                  invitationIds: selectedInvitations.map((item) => item._id),
                  resend: true,
                })
              }
            >
              <SendIcon aria-hidden="true" /> Resend selected
            </Button>
          </div>
          {selectionHelp ? (
            <p className="text-base text-muted-foreground">{selectionHelp}</p>
          ) : null}
        </Card>
      ) : null}

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : invitations.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MailIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No guest invitations yet</EmptyTitle>
            <EmptyDescription className="text-base">
              Add a guest one at a time, or import a spreadsheet with name and
              email columns.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              className={primaryActionClassName}
              onClick={(clickEvent) =>
                openEditor(null, clickEvent.currentTarget)
              }
            >
              <PlusIcon aria-hidden="true" /> Add first guest
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <Card className="hidden py-0 text-base md:flex">
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <span className="sr-only">Select invitation</span>
                    </TableHead>
                    <TableHead className="text-base">Guest</TableHead>
                    <TableHead className="text-base">
                      Invitation status
                    </TableHead>
                    <TableHead className="text-base">Order activity</TableHead>
                    <TableHead className="text-base">Latest send</TableHead>
                    <TableHead className="text-right text-base">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow
                      key={invitation._id}
                      data-state={
                        selectedIds.has(invitation._id) ? "selected" : undefined
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(invitation._id)}
                          onCheckedChange={(checked) =>
                            updateSelection(invitation._id, checked === true)
                          }
                          aria-label={`Select ${invitation.name}`}
                        />
                      </TableCell>
                      <TableCell className="max-w-sm whitespace-normal">
                        <p className="font-medium">{invitation.name}</p>
                        <p className="text-base break-all text-muted-foreground">
                          {invitation.email}
                        </p>
                      </TableCell>
                      <TableCell>
                        <DeliveryBadge state={invitation.latestDeliveryState} />
                      </TableCell>
                      <TableCell>
                        <ActivityBadge activity={invitation.activity} />
                      </TableCell>
                      <TableCell className="text-base whitespace-normal text-muted-foreground">
                        {formatDateTime(invitation.latestSentAt)}
                      </TableCell>
                      <TableCell>
                        <GuestActions
                          invitation={invitation}
                          onEdit={openEditor}
                          onRequestAction={openActionDialog}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="grid gap-3 md:hidden">
            {invitations.map((invitation) => (
              <Card
                key={invitation._id}
                className="text-base"
                data-state={
                  selectedIds.has(invitation._id) ? "selected" : undefined
                }
              >
                <CardHeader>
                  <CardTitle className="text-base">{invitation.name}</CardTitle>
                  <CardDescription className="text-base break-all">
                    {invitation.email}
                  </CardDescription>
                  <CardAction>
                    <Checkbox
                      checked={selectedIds.has(invitation._id)}
                      onCheckedChange={(checked) =>
                        updateSelection(invitation._id, checked === true)
                      }
                      aria-label={`Select ${invitation.name}`}
                    />
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 min-[400px]:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-base text-muted-foreground">
                        Invitation status
                      </p>
                      <DeliveryBadge state={invitation.latestDeliveryState} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base text-muted-foreground">
                        Order activity
                      </p>
                      <ActivityBadge activity={invitation.activity} />
                    </div>
                  </div>
                  <p className="text-base text-muted-foreground">
                    Latest send: {formatDateTime(invitation.latestSentAt)}
                  </p>
                  <GuestActions
                    invitation={invitation}
                    onEdit={openEditor}
                    onRequestAction={openActionDialog}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {response && (previousCursors.length > 0 || !response.isDone) ? (
        <Pagination aria-label="Guest invitation pages">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#guest-invitations-heading"
                onClick={(clickEvent) => {
                  clickEvent.preventDefault()
                  const previous = previousCursors.at(-1)
                  if (previousCursors.length === 0) return
                  setCursor(previous ?? null)
                  setPreviousCursors((current) => current.slice(0, -1))
                  setSelectedIds(new Set())
                }}
                aria-disabled={previousCursors.length === 0}
                className={
                  previousCursors.length === 0
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#guest-invitations-heading"
                onClick={(clickEvent) => {
                  clickEvent.preventDefault()
                  if (response.isDone) return
                  setPreviousCursors((current) => [...current, cursor])
                  setCursor(response.continueCursor)
                  setSelectedIds(new Set())
                }}
                aria-disabled={response.isDone}
                className={
                  response.isDone ? "pointer-events-none opacity-50" : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}

      <EventInvitationSheet
        key={editor?.session ?? 0}
        eventId={event._id}
        invitation={editor?.invitation ?? null}
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
        getReturnFocus={editor?.getReturnFocus ?? (() => null)}
      />

      <AlertDialog
        open={pendingDialog !== null}
        onOpenChange={(open) => {
          if (!open && !pendingAction) setPendingDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRetryDialog
                ? `Retry ${dialogCount} invitation${dialogCount === 1 ? "" : "s"}?`
                : isResendDialog
                  ? `Resend ${dialogCount} invitation${dialogCount === 1 ? "" : "s"}?`
                  : `Send ${dialogCount} invitation${dialogCount === 1 ? "" : "s"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {isRetryDialog
                ? "This retries delivery for the current invitation email."
                : isResendDialog
                  ? "Another email will be sent to each selected guest."
                  : "Each guest will receive the ordinary private event link."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className={primaryActionClassName}
              disabled={pendingAction}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              className={primaryActionClassName}
              disabled={pendingAction}
              onClick={runPendingAction}
            >
              {pendingAction ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : null}
              {pendingAction
                ? "Working…"
                : isRetryDialog
                  ? "Retry invitations"
                  : isResendDialog
                    ? "Resend invitations"
                    : "Send invitations"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
