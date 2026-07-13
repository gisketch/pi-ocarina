import { AppearanceSettings } from "@/features/settings/appearance-settings";

const ids = new Set(["application-font", "code-font", "interface-accent", "background-brightness", "project-palette"]);
export default <div className="mx-auto max-w-4xl p-8"><AppearanceSettings fontFamilies={["Atkinson Hyperlegible", "Departure Mono", "Geist Pixel", "JetBrains Mono", "Space Grotesk"]} preferences={{ theme: "dark", transparency: false, sidebar_visible: true, application_font: "Space Grotesk", code_font: "Departure Mono", background_brightness: 6 }} visibleIds={ids} onSave={async () => {}} /></div>;
