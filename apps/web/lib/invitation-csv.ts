const MAX_IMPORT_ROWS = 1_000

export type InvitationImportSource = "csv" | "paste"

export type InvitationImportRow = {
  email: string
  errors: string[]
  name: string
  normalizedEmail: string | null
  rowNumber: number
}

export type InvitationImportPreview = {
  errors: string[]
  rows: InvitationImportRow[]
}

export type InvitationImportOutcome = {
  email: string
  error?: string
  name: string
  outcome: "created" | "duplicate" | "invalid"
  rowNumber: number
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function normalizeInvitationEmail(value: string) {
  return value.trim().toLocaleLowerCase()
}

function csvRows(input: string): string[][] {
  const rows: string[][] = []
  let cell = ""
  let row: string[] = []
  let inQuotes = false

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]

    if (inQuotes) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') {
        inQuotes = false
      } else {
        cell += character
      }
      continue
    }

    if (character === '"') {
      inQuotes = true
    } else if (character === ",") {
      row.push(cell)
      cell = ""
    } else if (character === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (character !== "\r") {
      cell += character
    }
  }

  if (inQuotes) {
    throw new Error("A quoted value is not closed.")
  }

  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

function delimitedRows(input: string, delimiter: string): string[][] {
  return input.split(/\r?\n/).map((line) => line.split(delimiter))
}

function isBlankRow(row: string[]) {
  return row.every((value) => value.trim() === "")
}

function findHeaderRow(rows: string[][]) {
  return rows.findIndex((row) => !isBlankRow(row))
}

function validateRows(
  rows: string[][],
  allowHeaderlessRows: boolean
): InvitationImportPreview {
  const headerIndex = findHeaderRow(rows)
  if (headerIndex === -1) {
    return {
      errors: ["Add a header row with name and email columns."],
      rows: [],
    }
  }

  const headerRow = rows[headerIndex]
  if (!headerRow) {
    return {
      errors: ["Add a header row with name and email columns."],
      rows: [],
    }
  }
  const header = headerRow.map(normalizeHeader)
  const nameColumns = header.filter((value) => value === "name")
  const emailColumns = header.filter((value) => value === "email")
  const hasExactHeaders =
    nameColumns.length === 1 && emailColumns.length === 1 && header.length === 2
  const errors: string[] = []

  if (!hasExactHeaders && !allowHeaderlessRows) {
    errors.push("Use exactly two headers: name and email.")
  }
  if (errors.length > 0) return { errors, rows: [] }

  const nameIndex = hasExactHeaders ? header.indexOf("name") : 0
  const emailIndex = hasExactHeaders ? header.indexOf("email") : 1
  const dataStartIndex = hasExactHeaders ? headerIndex + 1 : headerIndex
  const parsedRows: InvitationImportRow[] = []
  const seenEmails = new Set<string>()

  for (let index = dataStartIndex; index < rows.length; index += 1) {
    const values = rows[index]
    if (!values) continue
    if (isBlankRow(values)) continue

    const name = (values[nameIndex] ?? "").trim()
    const email = (values[emailIndex] ?? "").trim()
    const rowErrors: string[] = []
    const normalizedEmail = email ? normalizeInvitationEmail(email) : null

    if (values.length > 2) rowErrors.push("This row has more than two columns.")
    if (!name) rowErrors.push("Enter a name.")
    if (!email) rowErrors.push("Enter an email address.")
    else if (!EMAIL_PATTERN.test(normalizedEmail!)) {
      rowErrors.push("Enter a valid email address.")
    } else if (seenEmails.has(normalizedEmail!)) {
      rowErrors.push("This email is duplicated in this import.")
    } else {
      seenEmails.add(normalizedEmail!)
    }

    parsedRows.push({
      email,
      errors: rowErrors,
      name,
      normalizedEmail,
      rowNumber: index + 1,
    })
  }

  if (parsedRows.length > MAX_IMPORT_ROWS) {
    errors.push("An import can contain up to 1,000 guest rows.")
  }

  return { errors, rows: parsedRows }
}

export function parseInvitationImport(
  input: string,
  source: InvitationImportSource
): InvitationImportPreview {
  const withoutBom = input.replace(/^\uFEFF/, "")
  if (!withoutBom.trim()) {
    return { errors: ["Paste or choose a file with guest rows."], rows: [] }
  }

  try {
    return validateRows(
      source === "paste" &&
        !withoutBom.includes(",") &&
        withoutBom.includes("\t")
        ? delimitedRows(withoutBom, "\t")
        : csvRows(withoutBom),
      source === "paste"
    )
  } catch (error) {
    return {
      errors: [
        error instanceof Error ? error.message : "This file could not be read.",
      ],
      rows: [],
    }
  }
}

export function getImportChunks(rows: InvitationImportRow[]) {
  const validRows = rows.filter((row) => row.errors.length === 0)
  return Array.from({ length: Math.ceil(validRows.length / 100) }, (_, index) =>
    validRows.slice(index * 100, (index + 1) * 100)
  )
}

function escapeCsvValue(value: string) {
  const formulaSafeValue = FORMULA_PREFIX_PATTERN.test(value.trim())
    ? `'${value}`
    : value
  return /[",\r\n]/.test(formulaSafeValue)
    ? `"${formulaSafeValue.replaceAll('"', '""')}"`
    : formulaSafeValue
}

export function createInvitationErrorCsv(outcomes: InvitationImportOutcome[]) {
  const lines = ["row,name,email,outcome,error"]
  for (const outcome of outcomes) {
    if (outcome.outcome === "created") continue
    lines.push(
      [
        String(outcome.rowNumber),
        outcome.name,
        outcome.email,
        outcome.outcome === "duplicate" ? "Skipped duplicate" : "Invalid",
        outcome.error ?? "",
      ]
        .map(escapeCsvValue)
        .join(",")
    )
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

export function downloadInvitationErrorCsv(
  outcomes: InvitationImportOutcome[]
) {
  const blob = new Blob([createInvitationErrorCsv(outcomes)], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "guest-import-errors.csv"
  link.click()
  URL.revokeObjectURL(url)
}
