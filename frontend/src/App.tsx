import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router'

import { Header } from './components/Header'

function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

function NotFoundPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-2 inline-block text-blue-700 underline">
        Back to tenders
      </Link>
    </div>
  )
}

// The tender pages arrive in T10 and the admin pages in T11.
const routes = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <h1 className="text-xl font-semibold">Tenders</h1> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

const router = createBrowserRouter(routes)

export default function App() {
  return <RouterProvider router={router} />
}
