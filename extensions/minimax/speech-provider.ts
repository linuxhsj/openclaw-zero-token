import type {
  SpeechProviderConfig,
  SpeechProviderPlugin,
} from "openclaw/plugin-sdk/speech-core";

const GLOBAL_TTS_URL = "https://api.minimax.io/v1/t2a_v2";
const DEFAULT_MODEL = "speech-2.8-hd";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function configValue(
  config: SpeechProviderConfig,
  key: string,
): string | undefined {
  return text(config[key]);
}

export function buildMinimaxSpeechProvider(): SpeechProviderPlugin {
  return {
    id: "minimax",
    label: "MiniMax",
    autoSelectOrder: 25,
    models: [
      "speech-2.8-hd",
      "speech-2.8-turbo",
      "speech-2.6-hd",
      "speech-2.6-turbo",
    ],
    resolveConfig: ({ rawConfig }) => {
      const providers = rawConfig.providers;
      const providerConfig =
        typeof providers === "object" && providers !== null
          ? (providers as Record<string, unknown>).minimax
          : undefined;
      return (
        typeof providerConfig === "object" && providerConfig !== null
          ? providerConfig
          : {}
      ) as SpeechProviderConfig;
    },
    isConfigured: ({ providerConfig }) =>
      Boolean(
        configValue(providerConfig, "apiKey") || process.env.MINIMAX_API_KEY,
      ),
    synthesize: async (req) => {
      const apiKey =
        configValue(req.providerConfig, "apiKey") ||
        process.env.MINIMAX_API_KEY;
      if (!apiKey) throw new Error("MiniMax API key missing");
      const endpoint =
        configValue(req.providerConfig, "baseUrl") || GLOBAL_TTS_URL;
      const model =
        configValue(req.providerOverrides ?? {}, "model") ||
        configValue(req.providerConfig, "model") ||
        DEFAULT_MODEL;
      const voice =
        configValue(req.providerOverrides ?? {}, "voice") ||
        configValue(req.providerConfig, "voice") ||
        "female-shaonv";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          text: req.text,
          stream: false,
          output_format: "hex",
          voice_setting: { voice_id: voice },
        }),
        signal: AbortSignal.timeout(req.timeoutMs),
      });
      if (!response.ok)
        throw new Error(`MiniMax TTS request failed (${response.status})`);
      const payload = (await response.json()) as {
        data?: { audio?: string };
        base_resp?: { status_code?: number };
      };
      if (
        payload.base_resp?.status_code &&
        payload.base_resp.status_code !== 0
      ) {
        throw new Error(
          `MiniMax TTS request failed (${payload.base_resp.status_code})`,
        );
      }
      if (!payload.data?.audio)
        throw new Error("MiniMax TTS response did not include audio");
      return {
        audioBuffer: Buffer.from(payload.data.audio, "hex"),
        outputFormat: "mp3",
        fileExtension: ".mp3",
        voiceCompatible: false,
      };
    },
  };
}
