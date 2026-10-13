// Shared by playwright.config.ts (which creates this admin in the e2e database) and the tests.
// These credentials exist only in the throwaway tender_desk_e2e database.
export const E2E_ADMIN = { username: 'e2e-admin', password: 'e2e-password-not-secret' }
export const API_PORT = 8001
export const WEB_PORT = 5174
export const API_BASE = `http://localhost:${API_PORT}`
