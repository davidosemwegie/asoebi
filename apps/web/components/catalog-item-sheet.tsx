"use client"

import { useRef, useState, type FormEvent } from "react"
import type { FunctionReturnType } from "convex/server"
import { useMutation } from "convex/react"
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react"

import { formatMinorUnitsForInput, parsePriceToMinorUnits } from "@/lib/money"
import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Textarea } from "@workspace/ui/components/textarea"

type CatalogItem = FunctionReturnType<typeof api.items.listForOwner>[number]

export function CatalogItemSheet({
  currency,
  eventId,
  item,
  onOpenChange,
  open,
  getReturnFocus,
}: {
  currency: string
  eventId: Id<"events">
  item: CatalogItem | null
  onOpenChange: (open: boolean) => void
  open: boolean
  getReturnFocus: () => HTMLElement | null
}) {
  const createItem = useMutation(api.items.create)
  const updateItem = useMutation(api.items.update)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [isPending, setIsPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isPending) return
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const description = String(formData.get("description") ?? "").trim()
    const unitLabel = String(formData.get("unitLabel") ?? "").trim()
    const priceMinor = parsePriceToMinorUnits(
      String(formData.get("price") ?? "")
    )
    const inventoryTotal = Number(formData.get("inventoryTotal"))

    setErrorMessage(null)

    if (!name || !unitLabel || priceMinor === null) {
      setErrorMessage(
        "Enter a name, unit label, and valid price with up to two decimal places."
      )
      return
    }

    if (
      !Number.isSafeInteger(inventoryTotal) ||
      inventoryTotal < 0 ||
      inventoryTotal > 1_000_000
    ) {
      setErrorMessage(
        "Inventory must be a whole number between 0 and 1,000,000."
      )
      return
    }

    setIsPending(true)
    const values = {
      name,
      description: description || undefined,
      unitLabel,
      priceMinor,
      inventoryTotal,
    }

    try {
      if (item) {
        await updateItem({ itemId: item._id, ...values })
      } else {
        await createItem({ eventId, ...values })
      }
      setIsPending(false)
      onOpenChange(false)
    } catch {
      setErrorMessage(
        item
          ? "We couldn't save these item changes. Check the details and try again."
          : "We couldn't add this item. Check the details and try again."
      )
      setIsPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg"
        showCloseButton={!isPending}
        initialFocus={nameInputRef}
        finalFocus={getReturnFocus}
      >
        <SheetHeader>
          <SheetTitle>{item ? "Edit item" : "Add item"}</SheetTitle>
          <SheetDescription>
            {item
              ? "Update how this item appears to you and your guests."
              : "Add an item organizers can prepare for this event."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="catalog-item-name">Name</FieldLabel>
                <Input
                  ref={nameInputRef}
                  id="catalog-item-name"
                  name="name"
                  defaultValue={item?.name ?? ""}
                  placeholder="Emerald lace"
                  maxLength={120}
                  required
                  disabled={isPending}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="catalog-item-description">
                  Description
                </FieldLabel>
                <Textarea
                  id="catalog-item-description"
                  name="description"
                  defaultValue={item?.description ?? ""}
                  placeholder="Optional details about the fabric or package."
                  maxLength={1000}
                  rows={4}
                  disabled={isPending}
                />
                <FieldDescription>
                  Optional, up to 1,000 characters.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="catalog-item-unit-label">
                  Unit label
                </FieldLabel>
                <Input
                  id="catalog-item-unit-label"
                  name="unitLabel"
                  defaultValue={item?.unitLabel ?? ""}
                  placeholder="5-yard bundle"
                  maxLength={60}
                  required
                  disabled={isPending}
                />
                <FieldDescription>
                  Describe what one ordered quantity contains.
                </FieldDescription>
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="catalog-item-price">
                    Price ({currency})
                  </FieldLabel>
                  <Input
                    id="catalog-item-price"
                    name="price"
                    type="text"
                    inputMode="decimal"
                    pattern="\d+(\.\d{1,2})?"
                    defaultValue={
                      item ? formatMinorUnitsForInput(item.priceMinor) : ""
                    }
                    placeholder="0.00"
                    required
                    disabled={isPending}
                  />
                  <FieldDescription>Free items can use 0.00.</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="catalog-item-inventory">
                    Total inventory
                  </FieldLabel>
                  <Input
                    id="catalog-item-inventory"
                    name="inventoryTotal"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1_000_000}
                    step={1}
                    defaultValue={item?.inventoryTotal ?? ""}
                    placeholder="0"
                    required
                    disabled={isPending}
                  />
                  {item?.reservedQuantity ? (
                    <FieldDescription>
                      At least {item.reservedQuantity} already set aside for
                      orders.
                    </FieldDescription>
                  ) : (
                    <FieldDescription>
                      Zero inventory is allowed.
                    </FieldDescription>
                  )}
                </Field>
              </div>

              {errorMessage ? (
                <Alert variant="destructive">
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertTitle>Item not saved</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}
            </FieldGroup>
          </div>

          <SheetFooter className="border-t">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 px-4 text-base"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="min-h-12 px-4 text-base"
              disabled={isPending}
            >
              {isPending ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : null}
              {isPending ? "Saving…" : item ? "Save changes" : "Add item"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
