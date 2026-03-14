# RecoDeck — Windows Build Setup Guide

This guide walks through setting up the Windows build environment for RecoDeck on a fresh Windows 10/11 machine. All commands are run in **PowerShell (as Administrator)** unless noted.

---

## Prerequisites

The following tools will be installed:

| Tool | Version | Purpose |
|------|---------|---------|
| VS Build Tools 2022 | Latest | MSVC compiler, Windows SDK, C++ headers (required by Aubio) |
| Rust (MSVC toolchain) | stable-msvc | Rust compiler targeting MSVC ABI |
| LLVM | 18+ | `libclang.dll` for Aubio's bindgen C-to-Rust bindings |
| Node.js | 20 LTS | Frontend build toolchain |

---

## Step 1 — Visual Studio Build Tools 2022

Install VS Build Tools via winget:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools
```

**IMPORTANT:** When the Visual Studio Installer opens, you must select the **"Desktop development with C++"** workload. Do NOT just pick individual C++ tools — the full workload installs:
- MSVC v143 compiler (cl.exe)
- Windows 10/11 SDK
- C++ standard library headers (`stdlib.h`, `string.h`, etc.)

These headers are required for Aubio's C code to compile. Missing the workload is the #1 cause of `stdlib.h not found` errors.

After installation, restart PowerShell.

---

## Step 2 — Rust (MSVC toolchain)

Install Rustup:

```powershell
winget install --id Rustlang.Rustup
```

Restart PowerShell after installation, then set the default toolchain to stable-msvc:

```powershell
rustup default stable-msvc
```

> Note: MSVC is the default Rust target on Windows. If you have a prior GNU toolchain, the above command switches it.

Add the Windows MSVC compile target explicitly:

```powershell
rustup target add x86_64-pc-windows-msvc
```

---

## Step 3 — LLVM 18 (for Aubio bindgen)

Install LLVM via winget (this installs the 64-bit build by default):

```powershell
winget install -e --id LLVM.LLVM
```

After installation, set the `LIBCLANG_PATH` environment variable **permanently** at the system level so bindgen can find `libclang.dll`:

```powershell
[System.Environment]::SetEnvironmentVariable(
  "LIBCLANG_PATH",
  "C:\Program Files\LLVM\bin",
  "Machine"
)
```

> **Must restart PowerShell** after setting this variable — it will not take effect in the current session.

> **Must be 64-bit LLVM.** The `winget` default is correct. If you previously installed a 32-bit LLVM manually, uninstall it and reinstall via winget.

---

## Step 4 — Node.js LTS

```powershell
winget install --id OpenJS.NodeJS.LTS
```

Restart PowerShell after installation.

---

## Step 5 — Verify Installations

Run the following verification commands in a **fresh** PowerShell window (to pick up all env vars):

```powershell
rustc --version
# Expected: rustc 1.xx.x (xxxxxxxx 20xx-xx-xx)

cargo --version
# Expected: cargo 1.xx.x (xxxxxxxx 20xx-xx-xx)

node --version
# Expected: v20.x.x

clang --version
# Expected: clang version 18.x.x (or newer)

echo $env:LIBCLANG_PATH
# Expected: C:\Program Files\LLVM\bin
```

If all commands return expected output, the environment is ready.

---

## Step 6 — Clone and Build

```powershell
git clone https://github.com/NM193/RecoDeck.git
cd RecoDeck
npm install
npm run build:win
```

The `build:win` script runs `version:sync` then `tauri build --target x86_64-pc-windows-msvc`. The first build will compile all Rust dependencies (including Aubio) and may take 10–20 minutes.

The installer will be output to:
```
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/recodeck_x.x.x_x64-setup.exe
```

---

## Step 7 — Dev Mode (Hot-Reload)

For development with live frontend reload:

```powershell
npx tauri dev
```

This is the same experience as macOS dev mode — Vite serves the frontend, Rust backend recompiles on changes.

---

## Troubleshooting

### (a) "libclang not found" or bindgen error

**Symptom:** Cargo build fails with an error referencing `libclang`, `bindgen`, or `clang.dll`.

**Fix:**
1. Verify `LIBCLANG_PATH` is set: `echo $env:LIBCLANG_PATH` — must show `C:\Program Files\LLVM\bin`
2. If empty, re-run the `SetEnvironmentVariable` command from Step 3
3. Open a **brand new** PowerShell window and try again — the variable is not inherited by existing sessions
4. Confirm 64-bit LLVM is installed: `clang --version` — must show version info (not "not found")

---

### (b) "stdlib.h not found" or missing C++ headers

**Symptom:** Cargo build fails with errors like `fatal error C1083: Cannot open include file: 'stdlib.h'` or similar missing header errors during Aubio compilation.

**Fix:**
1. Open **Visual Studio Installer** (search in Start menu)
2. Click **Modify** next to "Build Tools 2022"
3. Ensure **"Desktop development with C++"** workload is checked — not just individual components
4. Install/repair, then retry the build

---

### (c) "error 193: %1 is not a valid Win32 application"

**Symptom:** Build fails with error 193 when invoking clang or libclang.

**Cause:** A 32-bit LLVM is installed — bindgen loads it but the 64-bit Rust toolchain cannot execute a 32-bit DLL.

**Fix:**
1. Uninstall all existing LLVM installations
2. Reinstall via winget (which installs the 64-bit build): `winget install -e --id LLVM.LLVM`
3. Reset `LIBCLANG_PATH` to `C:\Program Files\LLVM\bin`
4. Open a new PowerShell and retry

---

## Plan B — Aubio Fallback (if Aubio fails on MSVC)

If Aubio's C compilation continues to fail after exhausting all troubleshooting above, the fallback plan is:

1. Make `bliss-audio-aubio-rs` an optional Cargo feature in `src-tauri/Cargo.toml`
2. Build with `--no-default-features` to produce a Windows binary without BPM/key detection
3. Display a notice in the UI that analysis features are unavailable on this platform

This fallback ships RecoDeck to Windows without audio analysis — all other features (library management, playback, playlists, AI curation) remain functional.

**Do NOT implement this fallback unless the standard build path is exhausted.** This is a plan B only.
