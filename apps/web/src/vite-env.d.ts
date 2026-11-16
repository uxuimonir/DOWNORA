/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Downora API, e.g. http://localhost:8787. Unset = API not configured. */
  readonly VITE_DOWNORA_API_URL?: string;
  /** `hash` for static hosts without SPA rewrites. Defaults to browser history routing. */
  readonly VITE_ROUTER?: 'hash' | 'browser';
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
