const FORMULA_PREFIX = /^[=+\-@\t\r]/

function safeCell(value: unknown) {
  const text = String(value ?? "")
  const protectedText =
    FORMULA_PREFIX.test(text) || FORMULA_PREFIX.test(text.trim())
      ? `'${text}`
      : text
  return /[",\r\n]/.test(protectedText)
    ? `"${protectedText.replaceAll('"', '""')}"`
    : protectedText
}

export function formatEventTime(value: unknown, timeZone: string) {
  if (typeof value !== "number") return ""
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "UTC",
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
  }).format(new Date(value))
}

export function createOrderCsv(rows: Array<Record<string, unknown>>) {
  const headers = [
    "Order reference",
    "Guest",
    "Email",
    "Phone",
    "Item",
    "Quantity",
    "Unit price",
    "Line total",
    "Order total",
    "Currency",
    "Payment status",
    "Progress",
    "Pickup or delivery",
    "Fulfillment option",
    "Submitted",
    "Payment decision",
    "Completed",
  ]
  const lines = rows.map((row) =>
    [
      row.reference,
      row.guestName,
      row.guestEmail,
      row.guestPhone,
      row.item,
      row.quantity,
      row.unitPriceMinor,
      row.lineTotalMinor,
      row.orderTotalMinor,
      row.currency,
      row.paymentStatus,
      row.progress,
      row.fulfillmentType,
      row.fulfillment,
      formatEventTime(row.submittedAt, String(row.timeZone)),
      formatEventTime(row.reviewedAt, String(row.timeZone)),
      formatEventTime(row.fulfilledAt, String(row.timeZone)),
    ]
      .map(safeCell)
      .join(",")
  )
  return `\uFEFF${[headers.map(safeCell).join(","), ...lines].join("\r\n")}\r\n`
}

export function orderCsvHeader() {
  return `\uFEFF${["Order reference", "Guest", "Email", "Phone", "Item", "Quantity", "Unit price", "Line total", "Order total", "Currency", "Payment status", "Progress", "Pickup or delivery", "Fulfillment option", "Submitted", "Payment decision", "Completed"].map(safeCell).join(",")}\r\n`
}

export function orderCsvRow(row: Record<string, unknown>) {
  return (
    [
      row.reference,
      row.guestName,
      row.guestEmail,
      row.guestPhone,
      row.item,
      row.quantity,
      row.unitPriceMinor,
      row.lineTotalMinor,
      row.orderTotalMinor,
      row.currency,
      row.paymentStatus,
      row.progress,
      row.fulfillmentType,
      row.fulfillment,
      formatEventTime(row.submittedAt, String(row.timeZone)),
      formatEventTime(row.reviewedAt, String(row.timeZone)),
      formatEventTime(row.fulfilledAt, String(row.timeZone)),
    ]
      .map(safeCell)
      .join(",") + "\r\n"
  )
}
