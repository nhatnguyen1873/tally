/**
 * Where a form opened from the expense list goes back to: the list, with the
 * filters it had. The list's links put its query string (`?q=…&c=…`, or
 * nothing) in the new history entry's state as `{ listSearch }`. Kept apart
 * from filters.ts, so the forms don't load the list's code.
 */
export function listHref(groupId: string, state: unknown): string {
  const search =
    typeof state === 'object' &&
    state !== null &&
    'listSearch' in state &&
    typeof state.listSearch === 'string' &&
    /^\?[^#]+$/.test(state.listSearch)
      ? state.listSearch
      : ''
  return `/g/${groupId}${search}`
}
