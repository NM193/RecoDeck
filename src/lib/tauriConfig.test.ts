import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// The CSP applies only to the built app (`tauri dev` serves the page from
// Vite without it), so a missing source shows up only after a release.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../src-tauri/tauri.conf.json'), 'utf-8'),
) as { app: { security: { csp: string } } }

function directive(name: string): string[] {
  const found = config.app.security.csp
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name)
  return found ? found.slice(1) : []
}

describe('CSP', () => {
  it("lets the page reach Tauri's IPC protocol", () => {
    // Without it Tauri falls back to postMessage, slower, and raw bytes
    // arrive as an array of numbers instead of an ArrayBuffer.
    expect(directive('connect-src')).toEqual(
      expect.arrayContaining(["'self'", 'ipc:', 'http://ipc.localhost']),
    )
  })
})
