import { resolve } from "node:path";

const appBinaryPath = resolve("src-tauri/target/debug/pi-ocarina");

export const config = {
  runner: "local",
  specs: ["./tests/e2e/**/*.spec.ts"],
  maxInstances: 1,
  services: [
    [
      "tauri",
      {
        appBinaryPath,
        driverProvider: "embedded",
        embeddedPort: 4445,
      },
    ],
  ],
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": { application: appBinaryPath },
    },
  ],
  logLevel: "error",
  waitforTimeout: 10_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 1,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },
};
