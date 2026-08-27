"use client"

import { useRef, useState } from "react"
import type { FunctionReturnType } from "convex/server"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  Edit3Icon,
  EyeIcon,
  EyeOffIcon,
  LockKeyholeIcon,
  MoreHorizontalIcon,
  PackageOpenIcon,
  PlusIcon,
} from "lucide-react"

import { CatalogItemSheet } from "@/components/catalog-item-sheet"
import { useEventWorkspace } from "@/components/event-workspace"
import { formatMoney } from "@/lib/money"
import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

type CatalogItem = FunctionReturnType<typeof api.items.listForOwner>[number]

type EditorState = {
  getReturnFocus: () => HTMLElement | null
  item: CatalogItem | null
  session: number
}

function VisibilityBadge({ isHidden }: { isHidden: boolean }) {
  return (
    <Badge variant={isHidden ? "outline" : "secondary"}>
      {isHidden ? "Hidden" : "Visible"}
    </Badge>
  )
}

function ReorderControls({
  disabled,
  index,
  item,
  itemCount,
  onMove,
}: {
  disabled: boolean
  index: number
  item: CatalogItem
  itemCount: number
  onMove: (itemId: Id<"items">, direction: "up" | "down") => void
}) {
  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${item.name} up`}
              disabled={disabled || index === 0}
              onClick={() => onMove(item._id, "up")}
            />
          }
        >
          <ArrowUpIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Move up</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${item.name} down`}
              disabled={disabled || index === itemCount - 1}
              onClick={() => onMove(item._id, "down")}
            />
          }
        >
          <ArrowDownIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Move down</TooltipContent>
      </Tooltip>
    </div>
  )
}

function ItemActions({
  disabled,
  item,
  onEdit,
  onVisibilityChange,
}: {
  disabled: boolean
  item: CatalogItem
  onEdit: (item: CatalogItem, returnFocus: HTMLElement | null) => void
  onVisibilityChange: (item: CatalogItem) => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
          />
        }
      >
        <MoreHorizontalIcon aria-hidden="true" />
        <span className="sr-only">Actions for {item.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={() => onEdit(item, triggerRef.current)}
          disabled={disabled}
        >
          <Edit3Icon aria-hidden="true" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onVisibilityChange(item)}
          disabled={disabled}
        >
          {item.isHidden ? (
            <EyeIcon aria-hidden="true" />
          ) : (
            <EyeOffIcon aria-hidden="true" />
          )}
          {item.isHidden ? "Show" : "Hide"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ItemControls({
  disabled,
  index,
  item,
  itemCount,
  onEdit,
  onMove,
  onVisibilityChange,
}: {
  disabled: boolean
  index: number
  item: CatalogItem
  itemCount: number
  onEdit: (item: CatalogItem, returnFocus: HTMLElement | null) => void
  onMove: (itemId: Id<"items">, direction: "up" | "down") => void
  onVisibilityChange: (item: CatalogItem) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <ReorderControls
        disabled={disabled}
        index={index}
        item={item}
        itemCount={itemCount}
        onMove={onMove}
      />
      <ItemActions
        disabled={disabled}
        item={item}
        onEdit={onEdit}
        onVisibilityChange={onVisibilityChange}
      />
    </div>
  )
}

export function EventCatalog() {
  const event = useEventWorkspace()
  const items = useQuery(api.items.listForOwner, { eventId: event._id })
  const moveItem = useMutation(api.items.move)
  const setHidden = useMutation(api.items.setHidden)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const editorSession = useRef(0)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const isArchived = event.status === "archived"
  const isAtLimit = (items?.length ?? 0) >= 100
  const actionsDisabled = isArchived || pendingAction !== null

  function openEditor(
    item: CatalogItem | null,
    returnFocus: HTMLElement | null
  ) {
    editorSession.current += 1
    setEditor({
      getReturnFocus: () =>
        item ? returnFocus : (addButtonRef.current ?? returnFocus),
      item,
      session: editorSession.current,
    })
  }

  async function handleMove(itemId: Id<"items">, direction: "up" | "down") {
    setActionError(null)
    setPendingAction(`move:${itemId}:${direction}`)
    try {
      await moveItem({ itemId, direction })
    } catch {
      setActionError("We couldn't move that item. Try again.")
    } finally {
      setPendingAction(null)
    }
  }

  async function handleVisibilityChange(item: CatalogItem) {
    setActionError(null)
    setPendingAction(`visibility:${item._id}`)
    try {
      await setHidden({ itemId: item._id, isHidden: !item.isHidden })
    } catch {
      setActionError(
        `We couldn't ${item.isHidden ? "show" : "hide"} that item. Try again.`
      )
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <TooltipProvider>
      <section className="space-y-6" aria-labelledby="catalog-heading">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="space-y-1">
            <h2
              id="catalog-heading"
              className="font-heading text-xl font-medium text-balance"
            >
              Product catalog
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">
              Add up to 100 priced items and manage their inventory and
              visibility.
            </p>
            <p className="text-xs text-muted-foreground">
              {items === undefined
                ? "Loading item count…"
                : `${items.length} of 100 items`}
            </p>
          </div>
          {items?.length !== 0 ? (
            <Button
              ref={addButtonRef}
              type="button"
              onClick={() => openEditor(null, addButtonRef.current)}
              disabled={isArchived || isAtLimit || items === undefined}
            >
              <PlusIcon aria-hidden="true" />
              Add item
            </Button>
          ) : null}
        </div>

        {isArchived ? (
          <Alert>
            <LockKeyholeIcon aria-hidden="true" />
            <AlertTitle>Archived catalog</AlertTitle>
            <AlertDescription>
              This catalog is read-only. Restore the event before changing its
              items.
            </AlertDescription>
          </Alert>
        ) : null}

        {isAtLimit ? (
          <Alert>
            <PackageOpenIcon aria-hidden="true" />
            <AlertTitle>Catalog limit reached</AlertTitle>
            <AlertDescription>
              This event already has the maximum of 100 items.
            </AlertDescription>
          </Alert>
        ) : null}

        {actionError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Catalog not updated</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {items === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : items.length === 0 ? (
          <Empty className="min-h-72 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageOpenIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No catalog items yet</EmptyTitle>
              <EmptyDescription>
                Add the first item with a price, unit, and available quantity.
              </EmptyDescription>
            </EmptyHeader>
            {!isArchived ? (
              <EmptyContent>
                <Button
                  type="button"
                  onClick={(clickEvent) =>
                    openEditor(null, clickEvent.currentTarget)
                  }
                >
                  <PlusIcon aria-hidden="true" />
                  Add first item
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <>
            <Card className="hidden py-0 md:flex">
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Inventory</TableHead>
                      <TableHead>Visibility</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={item._id}>
                        <TableCell className="max-w-md whitespace-normal">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.unitLabel}
                          </div>
                          {item.description ? (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {item.description}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {formatMoney(item.priceMinor, event.currency)}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          Available {item.availableQuantity} of{" "}
                          {item.inventoryTotal}
                        </TableCell>
                        <TableCell>
                          <VisibilityBadge isHidden={item.isHidden} />
                        </TableCell>
                        <TableCell>
                          <ItemControls
                            disabled={actionsDisabled}
                            index={index}
                            item={item}
                            itemCount={items.length}
                            onEdit={openEditor}
                            onMove={handleMove}
                            onVisibilityChange={handleVisibilityChange}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-3 md:hidden">
              {items.map((item, index) => (
                <Card key={item._id} size="sm">
                  <CardHeader>
                    <CardTitle>{item.name}</CardTitle>
                    <CardDescription>{item.unitLabel}</CardDescription>
                    <CardAction>
                      <VisibilityBadge isHidden={item.isHidden} />
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.description ? (
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                    <Separator />
                    <div className="flex items-end justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-mono font-medium tabular-nums">
                          {formatMoney(item.priceMinor, event.currency)}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground tabular-nums">
                          Available {item.availableQuantity} of{" "}
                          {item.inventoryTotal}
                        </p>
                      </div>
                      <ItemControls
                        disabled={actionsDisabled}
                        index={index}
                        item={item}
                        itemCount={items.length}
                        onEdit={openEditor}
                        onMove={handleMove}
                        onVisibilityChange={handleVisibilityChange}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </section>

      <CatalogItemSheet
        key={editor?.session ?? 0}
        currency={event.currency}
        eventId={event._id}
        item={editor?.item ?? null}
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
        getReturnFocus={editor?.getReturnFocus ?? (() => null)}
      />
    </TooltipProvider>
  )
}
