const FOOTER_TEXT = 'Independent project. Not an official Government of India website.'

export function Footer() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <p className="mx-auto max-w-5xl px-4 py-4 text-center text-sm text-muted">{FOOTER_TEXT}</p>
    </footer>
  )
}
