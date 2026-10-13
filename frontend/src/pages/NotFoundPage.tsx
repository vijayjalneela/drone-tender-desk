import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-2 inline-block text-blue-700 underline">
        Back to tenders
      </Link>
    </div>
  )
}
