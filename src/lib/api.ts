// Unified API selector — picks Tauri IPC or HTTP based on environment
// Desktop app uses Tauri IPC, mobile PWA uses HTTP fetch.

import { tauriApi } from "./tauri-api";
import { httpApi } from "./http-api";

/** True when running inside a Tauri desktop app */
export const isTauri = !!(window as unknown as Record<string, unknown>).__TAURI__;

/** True when running as a mobile PWA (no Tauri) */
export const isMobile = !isTauri;

// Export both APIs for direct use when needed
export { tauriApi, httpApi };
