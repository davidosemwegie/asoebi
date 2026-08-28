import { describe, expect, it } from "vitest"

import {
  createInvitationErrorCsv,
  getImportChunks,
  parseInvitationImport,
} from "./invitation-csv"

describe("invitation import parsing", () => {
  it("reads a BOM and quoted commas and newlines", () => {
    const result = parseInvitationImport(
      '\uFEFF name , EMAIL \r\n"Ola, Ayo",ola@example.com\r\n"Ada\nOkafor",ada@example.com',
      "csv"
    )

    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      expect.objectContaining({
        name: "Ola, Ayo",
        email: "ola@example.com",
        rowNumber: 2,
      }),
      expect.objectContaining({
        name: "Ada\nOkafor",
        email: "ada@example.com",
        rowNumber: 3,
      }),
    ])
  })

  it("supports pasted tab-separated rows and header order", () => {
    const result = parseInvitationImport(
      "email\tname\nada@example.com\tAda\n\nola@example.com\tOla",
      "paste"
    )

    expect(result.errors).toEqual([])
    expect(result.rows.map((row) => row.name)).toEqual(["Ada", "Ola"])
  })

  it("supports headerless pasted positional rows", () => {
    const commaSeparated = parseInvitationImport(
      "Ada,ada@example.com\nOla,ola@example.com",
      "paste"
    )
    const tabSeparated = parseInvitationImport(
      "Ada\tada@example.com\nOla\tola@example.com",
      "paste"
    )

    expect(commaSeparated.rows.map((row) => row.rowNumber)).toEqual([1, 2])
    expect(tabSeparated.rows.map((row) => row.email)).toEqual([
      "ada@example.com",
      "ola@example.com",
    ])
  })

  it("reports missing and duplicate headers", () => {
    expect(
      parseInvitationImport("name,name\nAyo,ayo@example.com", "csv").errors
    ).toEqual(["Use exactly two headers: name and email."])
    expect(parseInvitationImport("name\nAyo", "csv").errors).toEqual([
      "Use exactly two headers: name and email.",
    ])
  })

  it("marks local duplicate and invalid rows without dropping them", () => {
    const result = parseInvitationImport(
      "name,email\nAyo,AYO@example.com\nAnother,ayo@example.com\nBad,not-an-email",
      "csv"
    )

    expect(result.rows[1]?.errors).toContain(
      "This email is duplicated in this import."
    )
    expect(result.rows[2]?.errors).toContain("Enter a valid email address.")
  })

  it("rejects an import with more than 1,000 rows", () => {
    const rows = Array.from(
      { length: 1_001 },
      (_, index) => `Guest ${index},guest${index}@example.com`
    )
    const result = parseInvitationImport(
      `name,email\n${rows.join("\n")}`,
      "csv"
    )

    expect(result.errors).toContain(
      "An import can contain up to 1,000 guest rows."
    )
  })

  it("creates bounded chunks of 100 valid rows", () => {
    const rows = parseInvitationImport(
      `name,email\n${Array.from(
        { length: 201 },
        (_, index) => `Guest ${index},guest${index}@example.com`
      ).join("\n")}`,
      "csv"
    ).rows

    expect(getImportChunks(rows).map((chunk) => chunk.length)).toEqual([
      100, 100, 1,
    ])
  })
})

describe("invitation import error export", () => {
  it("uses UTF-8 BOM, RFC-4180 quoting, and spreadsheet formula protection", () => {
    const csv = createInvitationErrorCsv([
      {
        rowNumber: 4,
        name: "=SUM(1,1)",
        email: "guest@example.com",
        outcome: "invalid",
        error: "Email, please check",
      },
      {
        rowNumber: 5,
        name: "Good guest",
        email: "good@example.com",
        outcome: "created",
      },
    ])

    expect(csv).toBe(
      '\uFEFFrow,name,email,outcome,error\r\n4,"\'=SUM(1,1)",guest@example.com,Invalid,"Email, please check"\r\n'
    )
  })

  it("protects formulas preceded by spreadsheet whitespace controls", () => {
    const csv = createInvitationErrorCsv([
      {
        rowNumber: 6,
        name: "\t=SUM(1,1)",
        email: "\r+cmd@example.com",
        outcome: "invalid",
      },
    ])

    expect(csv).toContain('"\'\t=SUM(1,1)"')
    expect(csv).toContain('"\'\r+cmd@example.com"')
  })
})
