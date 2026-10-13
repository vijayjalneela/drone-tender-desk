import type { RouteObject } from 'react-router'

import { RequireAdmin } from './auth/RequireAdmin'
import { Layout } from './components/Layout'
import { AddTenderPage } from './pages/admin/AddTenderPage'
import { DashboardPage } from './pages/admin/DashboardPage'
import { LoginPage } from './pages/admin/LoginPage'
import { ReviewTenderPage } from './pages/admin/ReviewTenderPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { TenderDetailPage } from './pages/TenderDetailPage'
import { TenderListPage } from './pages/TenderListPage'

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <TenderListPage /> },
      { path: 'tenders/:tenderId', element: <TenderDetailPage /> },
      { path: 'admin/login', element: <LoginPage /> },
      {
        path: 'admin',
        element: <RequireAdmin />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'tenders/new', element: <AddTenderPage /> },
          { path: 'tenders/:tenderId/review', element: <ReviewTenderPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
