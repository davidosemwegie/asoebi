const MAX_PRICE_MINOR = 999_999_999_999

export function formatMoney(priceMinor: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(priceMinor / 100)
}

export function formatMinorUnitsForInput(priceMinor: number) {
  const whole = Math.floor(priceMinor / 100)
  const fraction = String(priceMinor % 100).padStart(2, "0")
  return `${whole}.${fraction}`
}

export function parsePriceToMinorUnits(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null

  const whole = Number(match[1])
  const fraction = Number((match[2] ?? "").padEnd(2, "0"))
  const priceMinor = whole * 100 + fraction

  if (!Number.isSafeInteger(priceMinor) || priceMinor > MAX_PRICE_MINOR) {
    return null
  }

  return priceMinor
}
