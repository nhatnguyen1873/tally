/** A message, or plural forms of one chosen by the `count` parameter. */
export type Message =
  string | (Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> & { readonly other: string })

export type Params = Readonly<Record<string, string | number>>

/** Placeholder names in a message: "{name} paid {amount}" → "name" | "amount". */
export type Placeholders<S> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never

/** Parameters a message needs. Plural messages always need `count`. */
export type MessageParams<M> = M extends string
  ? Placeholders<M>
  : M extends Readonly<Record<string, string>>
    ? Placeholders<M[keyof M]> | 'count'
    : never

const PLACEHOLDER = /\{(\w+)\}/g

/** Fills a message's `{placeholders}`, picking the plural form for `count` if it has forms. */
export function translate(message: Message, params: Params | undefined, plurals: Intl.PluralRules) {
  const template =
    typeof message === 'string'
      ? message
      : (message[plurals.select(Number(params?.count ?? 0))] ?? message.other)
  return template.replace(PLACEHOLDER, (match, name: string) =>
    params && Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

/** Every placeholder a message uses, across all its plural forms. */
export function placeholdersOf(message: Message): Set<string> {
  const forms = typeof message === 'string' ? [message] : Object.values(message)
  return new Set(
    forms.flatMap((form) => [...form.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '')),
  )
}
