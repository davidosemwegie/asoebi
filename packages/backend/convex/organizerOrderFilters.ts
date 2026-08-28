/**
 * The organizer list and export share this deliberately small filter contract.
 * Keep normalization here so an export cannot silently mean something different
 * from the table an organizer is looking at.
 */
export const ORDER_SEARCH_MAX_LENGTH = 120

export function normalizeOrderSearch(value: string | undefined) {
  const search = value?.trim().toLowerCase()
  if (!search) return undefined
  if (search.length > ORDER_SEARCH_MAX_LENGTH) {
    throw new Error("Search is too long.")
  }
  return search
}
