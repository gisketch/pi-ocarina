declare module "*.css";
declare module "pixelarticons/svg/*.svg" { const url: string; export default url; }

interface ImportMetaEnv {
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
