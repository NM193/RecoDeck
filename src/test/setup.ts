import { mockIPC, clearMocks } from '@tauri-apps/api/mocks'

// Install window.__TAURI_INTERNALS__ before each test.
// Without this, any import of tauri-api.ts throws:
// "TypeError: window.__TAURI_INTERNALS__ is undefined"
beforeEach(() => {
  mockIPC(() => {
    // Default: return undefined
    // Individual tests override with local mockIPC or vi.mock calls
  })
})

afterEach(() => {
  clearMocks()
})
