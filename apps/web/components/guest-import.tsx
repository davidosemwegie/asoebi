"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { useMutation } from "convex/react"
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  LoaderCircleIcon,
  UploadIcon,
} from "lucide-react"

import { useEventWorkspace } from "@/components/event-workspace"
import {
  createInvitationErrorCsv,
  getImportChunks,
  localInvitationImportOutcome,
  parseInvitationImport,
  type InvitationImportOutcome,
  type InvitationImportPreview,
  type InvitationImportRow,
  type InvitationImportSource,
} from "@/lib/invitation-csv"
import { api } from "@workspace/backend/convex/_generated/api"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

type ImportFeedback = { message: string; type: "error" | "success" } | null

const controlClassName = "min-h-12 text-base"
const actionClassName = "min-h-12 px-4 text-base"

function downloadErrors(outcomes: InvitationImportOutcome[]) {
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

function rowOutcome(
  row: InvitationImportRow,
  outcomes: InvitationImportOutcome[]
) {
  return outcomes.find((outcome) => outcome.rowNumber === row.rowNumber)
}

function isLocalDuplicate(row: InvitationImportRow) {
  return localInvitationImportOutcome(row)?.outcome === "duplicate"
}

export function GuestImport() {
  const event = useEventWorkspace()
  const importBatch = useMutation(api.eventInvitations.importBatch)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<InvitationImportPreview | null>(null)
  const [source, setSource] = useState<InvitationImportSource>("csv")
  const [importId, setImportId] = useState<string | null>(null)
  const [pastedValue, setPastedValue] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const [feedback, setFeedback] = useState<ImportFeedback>(null)
  const [outcomes, setOutcomes] = useState<InvitationImportOutcome[]>([])

  function resetPreviewState() {
    setImportId(null)
    setOutcomes([])
    setFeedback(null)
  }

  function setParsedPreview(value: string, nextSource: InvitationImportSource) {
    setSource(nextSource)
    setPreview(parseInvitationImport(value, nextSource))
    resetPreviewState()
    setImportId(crypto.randomUUID())
  }

  async function handleFileChange(
    changeEvent: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = changeEvent.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setPreview({ errors: ["Choose a CSV file smaller than 2 MB."], rows: [] })
      resetPreviewState()
      return
    }
    try {
      setParsedPreview(await file.text(), "csv")
    } catch {
      setPreview({ errors: ["This CSV file could not be read."], rows: [] })
      resetPreviewState()
    }
  }

  function handlePastedPreview() {
    setParsedPreview(pastedValue, "paste")
    setPastedValue("")
  }

  async function handleImport() {
    if (!preview || preview.errors.length > 0 || isImporting) return
    const chunks = getImportChunks(preview.rows)
    if (chunks.length === 0) {
      setFeedback({
        type: "error",
        message: "Fix the row errors before importing guests.",
      })
      return
    }

    if (!importId) return
    const localOutcomes: InvitationImportOutcome[] = preview.rows.flatMap(
      (row) => {
        const outcome = localInvitationImportOutcome(row)
        return outcome ? [outcome] : []
      }
    )

    const localRowNumbers = new Set(
      localOutcomes.map((outcome) => outcome.rowNumber)
    )
    const serverOutcomes = new Map(
      outcomes
        .filter((outcome) => !localRowNumbers.has(outcome.rowNumber))
        .map((outcome) => [outcome.rowNumber, outcome])
    )
    setOutcomes([...localOutcomes, ...serverOutcomes.values()])
    setIsImporting(true)
    setFeedback(null)
    try {
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const result = await importBatch({
          eventId: event._id,
          importId,
          chunkIndex,
          source,
          rows: chunk.map((row) => ({
            rowNumber: row.rowNumber,
            name: row.name,
            email: row.email,
          })),
        })
        for (const outcome of result.outcomes) {
          const row = chunk.find(
            (candidate) => candidate.rowNumber === outcome.rowNumber
          )
          serverOutcomes.set(outcome.rowNumber, {
            rowNumber: outcome.rowNumber,
            name: row?.name ?? "",
            email: row?.email ?? "",
            outcome: outcome.outcome,
            error: outcome.error,
          })
        }
        setOutcomes([...localOutcomes, ...serverOutcomes.values()])
      }
      const allOutcomes = [...localOutcomes, ...serverOutcomes.values()]
      setOutcomes(allOutcomes)
      const created = allOutcomes.filter(
        (outcome) => outcome.outcome === "created"
      ).length
      const duplicates = allOutcomes.filter(
        (outcome) => outcome.outcome === "duplicate"
      ).length
      const invalid = allOutcomes.filter(
        (outcome) => outcome.outcome === "invalid"
      ).length
      setFeedback({
        type: invalid > 0 ? "error" : "success",
        message: `${created} created, ${duplicates} skipped duplicate${duplicates === 1 ? "" : "s"}, and ${invalid} invalid. Guests were saved but no invitations were sent.`,
      })
      setImportId(null)
    } catch {
      setFeedback({
        type: "error",
        message:
          "Some rows may already be saved. Try again to resume this import safely; no invitations were sent.",
      })
    } finally {
      setIsImporting(false)
    }
  }

  const validCount =
    preview?.rows.filter((row) => row.errors.length === 0).length ?? 0
  const invalidCount =
    preview?.rows.filter(
      (row) => row.errors.length > 0 && !isLocalDuplicate(row)
    ).length ?? 0
  const duplicateCount = preview?.rows.filter(isLocalDuplicate).length ?? 0
  const canImport = Boolean(
    preview &&
    importId &&
    preview.errors.length === 0 &&
    validCount > 0 &&
    !isImporting
  )

  return (
    <section
      className="space-y-6 text-base"
      aria-labelledby="guest-import-heading"
    >
      <div className="space-y-3">
        <Button
          type="button"
          variant="ghost"
          className={actionClassName}
          nativeButton={false}
          render={<Link href={`/events/${event._id}/guests`} />}
        >
          <ArrowLeftIcon aria-hidden="true" /> Back to guest invitations
        </Button>
        <div className="space-y-2">
          <h2
            id="guest-import-heading"
            className="font-heading text-2xl font-semibold text-balance"
          >
            Import guest invitations
          </h2>
          <p className="max-w-3xl text-base leading-7 text-pretty text-muted-foreground">
            Add up to 1,000 guests from a CSV file or pasted spreadsheet rows.
            Use the exact name and email columns. Saving an import never sends
            invitations automatically.
          </p>
        </div>
      </div>

      <Card className="text-base">
        <CardHeader>
          <CardTitle className="text-lg">Choose guest rows</CardTitle>
          <CardDescription className="text-base">
            Supported columns: name, email. Header spelling ignores case and
            extra spaces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="guest-import-file">CSV file</FieldLabel>
              <Input
                ref={fileInputRef}
                id="guest-import-file"
                type="file"
                accept=".csv,text/csv"
                className={controlClassName}
                onChange={handleFileChange}
                disabled={isImporting}
              />
              <FieldDescription className="text-base">
                The file is read in this browser for preview; only structured
                valid rows are sent when you confirm the import.
              </FieldDescription>
            </Field>
            <div className="border-t pt-5">
              <Field>
                <FieldLabel htmlFor="guest-import-paste">
                  Paste spreadsheet rows
                </FieldLabel>
                <Textarea
                  id="guest-import-paste"
                  value={pastedValue}
                  onChange={(changeEvent) =>
                    setPastedValue(changeEvent.target.value)
                  }
                  placeholder={"name\temail\nAda Okafor\tada@example.com"}
                  rows={8}
                  className="min-h-40 text-base"
                  disabled={isImporting}
                />
                <FieldDescription className="text-base">
                  Paste a header row, or use name then email in each tab- or
                  comma-separated row.
                </FieldDescription>
              </Field>
              <Button
                type="button"
                variant="outline"
                className={`${actionClassName} mt-3`}
                onClick={handlePastedPreview}
                disabled={!pastedValue.trim() || isImporting}
              >
                Preview pasted rows
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      {preview ? (
        <Card className="text-base">
          <CardHeader>
            <CardTitle className="text-lg">Import preview</CardTitle>
            <CardDescription className="text-base">
              Review this browser preview before saving. The server validates
              every submitted row again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.errors.length > 0 ? (
              <Alert variant="destructive" className="text-base">
                <CircleAlertIcon aria-hidden="true" />
                <AlertTitle>Import needs attention</AlertTitle>
                <AlertDescription className="text-base">
                  {preview.errors.join(" ")}
                </AlertDescription>
              </Alert>
            ) : null}
            <div
              className="flex flex-wrap gap-2"
              role="status"
              aria-label="Import preview totals"
            >
              <Badge variant="secondary" className="h-8 text-sm">
                {validCount} ready
              </Badge>
              <Badge
                variant={invalidCount ? "destructive" : "outline"}
                className="h-8 text-sm"
              >
                {invalidCount} invalid
              </Badge>
              <Badge
                variant={duplicateCount ? "destructive" : "outline"}
                className="h-8 text-sm"
              >
                {duplicateCount} local duplicate
                {duplicateCount === 1 ? "" : "s"}
              </Badge>
            </div>
            {preview.rows.length === 0 ? (
              <Empty className="min-h-48 border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileSpreadsheetIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No rows ready to preview</EmptyTitle>
                  <EmptyDescription className="text-base">
                    Correct the CSV headers or add guest rows, then preview
                    again.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-2">
                {preview.rows.map((row) => {
                  const outcome = rowOutcome(row, outcomes)
                  const errors = outcome?.error ? [outcome.error] : row.errors
                  const label =
                    outcome?.outcome === "created"
                      ? "Created"
                      : outcome?.outcome === "duplicate"
                        ? "Skipped duplicate"
                        : isLocalDuplicate(row)
                          ? "Skipped duplicate"
                          : errors.length
                            ? "Invalid"
                            : "Ready"
                  return (
                    <div
                      key={row.rowNumber}
                      className="rounded-lg border p-3 sm:grid sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start sm:gap-3"
                    >
                      <p className="font-medium tabular-nums">
                        Row {row.rowNumber}
                      </p>
                      <p className="min-w-0 break-words">
                        {row.name || "No name"}
                      </p>
                      <p className="min-w-0 break-all text-muted-foreground">
                        {row.email || "No email"}
                      </p>
                      <div className="mt-2 space-y-1 sm:mt-0 sm:text-right">
                        <Badge
                          variant={
                            label === "Ready" ||
                            label === "Created" ||
                            label === "Skipped duplicate"
                              ? "secondary"
                              : "destructive"
                          }
                          className="h-7 text-sm"
                        >
                          {label}
                        </Badge>
                        {errors.map((error) => (
                          <p
                            key={error}
                            className="max-w-xs text-base text-destructive"
                          >
                            {error}
                          </p>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-base text-muted-foreground">
                Imports save valid rows and report invalid or duplicate rows.
                They never send email automatically.
              </p>
              <Button
                type="button"
                className={actionClassName}
                disabled={!canImport}
                onClick={handleImport}
              >
                {isImporting ? (
                  <LoaderCircleIcon
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <UploadIcon aria-hidden="true" />
                )}
                {isImporting
                  ? "Importing…"
                  : `Import ${validCount} guest${validCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

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
          <AlertTitle>
            {feedback.type === "error"
              ? "Import completed with issues"
              : "Guests imported"}
          </AlertTitle>
          <AlertDescription className="text-base">
            {feedback.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {outcomes.some((outcome) => outcome.outcome !== "created") ? (
        <Button
          type="button"
          variant="outline"
          className={actionClassName}
          onClick={() => downloadErrors(outcomes)}
        >
          <DownloadIcon aria-hidden="true" /> Download error report
        </Button>
      ) : null}
    </section>
  )
}
