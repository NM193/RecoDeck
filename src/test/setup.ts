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

// HTMLAudioElement mock — jsdom does not implement Audio playback APIs.
// AudioPlayer instantiates Audio elements and calls play/pause/load on them.
function makeMockAudio() {
  return {
    play: () => Promise.resolve(),
    pause: () => {},
    load: () => {},
    removeAttribute: (_name: string) => {},
    addEventListener: (_event: string, _handler: EventListenerOrEventListenerObject) => {},
    removeEventListener: (_event: string, _handler: EventListenerOrEventListenerObject) => {},
    dispatchEvent: (_event: Event) => true,
    src: '',
    currentSrc: '',
    currentTime: 0,
    duration: NaN,
    volume: 1,
    muted: false,
    paused: true,
    ended: false,
    playbackRate: 1,
    preservesPitch: true,
    crossOrigin: null,
    preload: 'auto',
    autoplay: false,
    loop: false,
    error: null,
    networkState: 0,
    readyState: 0,
    buffered: { length: 0, start: () => 0, end: () => 0 },
    onended: null,
    onerror: null,
    ontimeupdate: null,
    oncanplaythrough: null,
    onloadedmetadata: null,
  }
}

// Override global Audio constructor so `new Audio()` works in jsdom.
;(globalThis as Record<string, unknown>).Audio = function () {
  return makeMockAudio()
}

// Minimal AudioContext mock — AudioPlayer creates one via `new AudioContext()`.
;(globalThis as Record<string, unknown>).AudioContext = class {
  state = 'running'
  currentTime = 0
  destination = {}
  createGain() {
    return {
      gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
      connect: () => {},
      disconnect: () => {},
    }
  }
  createMediaElementSource() {
    return { connect: () => {} }
  }
  resume() { return Promise.resolve() }
  close() { return Promise.resolve() }
  suspend() { return Promise.resolve() }
}
