// src/commands/auth-choice.apply.mimo-web.ts
import { CommandModule } from "yargs";
import { saveAuthProfile } from "../auth/profiles";
import { loginMimoWeb } from "../providers/mimo-web-auth";

export const mimoWebAuthCommand: CommandModule = {
  command: "mimo-web",
  describe: "Authenticate with Xiaomi MiMo-Web via browser login",
  handler: async (argv) => {
    const { browser, page } = await (globalThis as any).__openclaw_browser__;

    try {
      console.log("?? Starting MiMo-Web authentication...");

      const credentials = await loginMimoWeb({
        onProgress: (msg) => console.log(`  ${msg}`),
        openUrl: async (url) => {
          await page.goto(url);
          return true;
        },
        browser,
        page,
      });

      // Save credentials
      await saveAuthProfile("mimo-web:default", {
        provider: "mimo-web",
        credentials,
        timestamp: Date.now(),
      });

      console.log("? MiMo-Web authentication saved successfully!");
      console.log("   You can now use MiMo models with:");
      console.log("   /model mimo-web/mimo-v1");
    } catch (error) {
      console.error("? MiMo-Web authentication failed:", error.message);
      process.exit(1);
    }
  },
};
