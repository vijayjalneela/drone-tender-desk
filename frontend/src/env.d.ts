interface ImportMetaEnv {
  /** Backend server address without /api, e.g. http://localhost:8000. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
