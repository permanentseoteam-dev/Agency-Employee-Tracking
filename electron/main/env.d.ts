/// <reference types="electron-vite/node" />

// Build-time variables (electron-vite exposes VITE_* to every process).
interface ImportMetaEnv {
  readonly VITE_PB_URL: string
}
