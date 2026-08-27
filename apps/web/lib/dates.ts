export function toDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function fromDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year!, month! - 1, day)
}

export function formatDateValue(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
  }).format(fromDateValue(value))
}
