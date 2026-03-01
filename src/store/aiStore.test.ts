import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock tauriApi BEFORE importing aiStore (vi.mock is hoisted)
vi.mock('../lib/tauri-api', () => ({
  tauriApi: {
    getAIApiKeyStatus: vi.fn(),
    setAIApiKey: vi.fn(),
    deleteAIApiKey: vi.fn(),
    aiChat: vi.fn(),
    aiGeneratePlaylist: vi.fn(),
  },
}))

import { useAIStore } from './aiStore'
import { tauriApi } from '../lib/tauri-api'

beforeEach(() => {
  useAIStore.setState(useAIStore.getInitialState(), true)
  vi.clearAllMocks()
})

describe('aiStore - checkApiKeyStatus', () => {
  it('sets isApiKeyConfigured true when API returns true', async () => {
    vi.mocked(tauriApi.getAIApiKeyStatus).mockResolvedValue(true)
    await useAIStore.getState().checkApiKeyStatus()
    expect(useAIStore.getState().isApiKeyConfigured).toBe(true)
  })

  it('sets isApiKeyConfigured false when API returns false', async () => {
    vi.mocked(tauriApi.getAIApiKeyStatus).mockResolvedValue(false)
    await useAIStore.getState().checkApiKeyStatus()
    expect(useAIStore.getState().isApiKeyConfigured).toBe(false)
  })

  it('sets isApiKeyConfigured false on error', async () => {
    vi.mocked(tauriApi.getAIApiKeyStatus).mockRejectedValue(new Error('network'))
    await useAIStore.getState().checkApiKeyStatus()
    expect(useAIStore.getState().isApiKeyConfigured).toBe(false)
  })
})

describe('aiStore - setApiKey', () => {
  it('sets isApiKeyConfigured true and clears error on success', async () => {
    vi.mocked(tauriApi.setAIApiKey).mockResolvedValue(undefined)
    await useAIStore.getState().setApiKey('sk-test-key')
    expect(useAIStore.getState().isApiKeyConfigured).toBe(true)
    expect(useAIStore.getState().error).toBeNull()
    expect(tauriApi.setAIApiKey).toHaveBeenCalledWith('sk-test-key')
  })

  it('sets error message on failure and throws', async () => {
    vi.mocked(tauriApi.setAIApiKey).mockRejectedValue('save failed')
    await expect(useAIStore.getState().setApiKey('bad-key')).rejects.toBeTruthy()
    expect(useAIStore.getState().error).toBeTruthy()
  })
})

describe('aiStore - deleteApiKey', () => {
  it('sets isApiKeyConfigured false on success', async () => {
    // Start with key configured
    useAIStore.setState({ isApiKeyConfigured: true })
    vi.mocked(tauriApi.deleteAIApiKey).mockResolvedValue(undefined)
    await useAIStore.getState().deleteApiKey()
    expect(useAIStore.getState().isApiKeyConfigured).toBe(false)
    expect(useAIStore.getState().error).toBeNull()
  })

  it('sets error on failure and throws', async () => {
    vi.mocked(tauriApi.deleteAIApiKey).mockRejectedValue('delete failed')
    await expect(useAIStore.getState().deleteApiKey()).rejects.toBeTruthy()
    expect(useAIStore.getState().error).toBeTruthy()
  })
})

describe('aiStore - UI actions', () => {
  it('setIsOpen toggles open state', () => {
    useAIStore.getState().setIsOpen(true)
    expect(useAIStore.getState().isOpen).toBe(true)
    useAIStore.getState().setIsOpen(false)
    expect(useAIStore.getState().isOpen).toBe(false)
  })

  it('clearHistory resets chat state', () => {
    useAIStore.setState({
      chatHistory: [{ role: 'user', content: 'hello' }],
      error: 'some error',
    })
    useAIStore.getState().clearHistory()
    expect(useAIStore.getState().chatHistory).toHaveLength(0)
    expect(useAIStore.getState().error).toBeNull()
  })

  it('setError sets and clears error', () => {
    useAIStore.getState().setError('test error')
    expect(useAIStore.getState().error).toBe('test error')
    useAIStore.getState().setError(null)
    expect(useAIStore.getState().error).toBeNull()
  })
})
