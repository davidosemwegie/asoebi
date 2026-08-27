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

type DateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function getDateTimeParts(timestamp: number, timeZone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
  }
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function serializeDateTimeParts(parts: DateTimeParts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export function formatDateTimeLocal(timestamp: number, timeZone: string) {
  return serializeDateTimeParts(getDateTimeParts(timestamp, timeZone))
}

export function zonedDateTimeToEpoch(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const desired: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }
  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute
  )
  let candidate = desiredAsUtc

  try {
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const actual = getDateTimeParts(candidate, timeZone)
      const actualAsUtc = Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute
      )
      candidate += desiredAsUtc - actualAsUtc
    }
    return formatDateTimeLocal(candidate, timeZone) === value ? candidate : null
  } catch {
    return null
  }
}

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

export function getSupportedTimeZones() {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[]
  }
  return (
    intl.supportedValuesOf?.("timeZone") ?? [
      "Africa/Lagos",
      "America/New_York",
      "America/Toronto",
      "Europe/London",
      "UTC",
    ]
  )
}

export function formatDeadline(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(timestamp)
}
