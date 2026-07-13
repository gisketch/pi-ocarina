import { ModelCatalogProvider } from "@/features/models/model-catalog-context";
import { ProvidersSettings } from "@/features/settings/providers-settings";

const catalog = { providers: [{ id: "openai", name: "OpenAI", configured: true, source: "stored" }, { id: "anthropic", name: "Anthropic", configured: true, source: "environment", label: "ANTHROPIC_API_KEY" }, { id: "google", name: "Google", configured: false }], models: [{ provider: "openai", id: "gpt-5", name: "GPT-5", available: true }], customEndpoints: [], errors: [] };
export default <ModelCatalogProvider initialCatalog={catalog} watch={false}><div className="mx-auto max-w-4xl p-8"><ProvidersSettings visibleIds={new Set(["default-model", "credentials", "custom-endpoints"])} /></div></ModelCatalogProvider>;
