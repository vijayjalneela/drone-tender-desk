import type { RouteObject } from 'react-router'

import { Layout } from './components/Layout'
import { NotFoundPage } from './pages/NotFoundPage'
import { TenderDetailPage } from './pages/TenderDetailPage'
import { TenderListPage } from './pages/TenderListPage'

// The admin pages arrive in T11.
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <TenderListPage /> },
      { path: 'tenders/:tenderId', element: <TenderDetailPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
