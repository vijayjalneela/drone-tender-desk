import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-navy-900">Page not found</h1>
      <Link to="/" className="mt-2 inline-block text-navy-700 underline">
        Back to tenders
      </Link>
    </div>
  )
}
