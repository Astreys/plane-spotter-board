/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ImportMetaEnv {
  /** Absolute API origin in production. Empty means same origin. */
  readonly VITE_API_BASE?: string;
  /** Google Analytics measurement ID. Unset means no analytics at all. */
  readonly VITE_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
