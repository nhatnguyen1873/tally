// Four strokes and a strike: the tally mark Tally is named after.
export function TallyMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M13 10v28M20 10v28M27 10v28M34 10v28" />
      <path d="M8 31 40 17" />
    </svg>
  )
}
