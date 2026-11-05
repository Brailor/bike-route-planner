/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ArcGIS Location Platform API key for satellite tiles (ADR 0009); without it, no satellite background. */
  readonly VITE_ESRI_API_KEY?: string;
}
