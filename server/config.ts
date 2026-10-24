import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const ENV_PATH = path.resolve(process.cwd(), '.env');
dotenv.config({ path: ENV_PATH });

export interface ServerEnvConfig {
  port: number;
  geminiApiKey: string;
  tavilyApiKey: string;
  serperApiKey: string;
  hunterApiKey: string;
  brevoApiKeyEnv: string;
  brevoSenderEmailEnv: string;
}

export function getServerConfig(): ServerEnvConfig {
  return {
    port: Number(process.env.PORT || 3001),
    geminiApiKey: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim(),
    tavilyApiKey: (process.env.TAVILY_API_KEY || '').trim(),
    serperApiKey: (process.env.SERPER_API_KEY || '').trim(),
    hunterApiKey: (process.env.HUNTER_API_KEY || '').trim(),
    brevoApiKeyEnv: (process.env.BREVO_API_KEY || '').trim(),
    brevoSenderEmailEnv: (process.env.BREVO_SENDER_EMAIL || '').trim(),
  };
}

export function saveServerApiKeys(keys: {
  geminiApiKey?: string;
  hunterApiKey?: string;
  serperApiKey?: string;
  tavilyApiKey?: string;
}): void {
  if (keys.geminiApiKey !== undefined && keys.geminiApiKey.trim() !== '') {
    process.env.GEMINI_API_KEY = keys.geminiApiKey.trim();
  }
  if (keys.hunterApiKey !== undefined && keys.hunterApiKey.trim() !== '') {
    process.env.HUNTER_API_KEY = keys.hunterApiKey.trim();
  }
  if (keys.serperApiKey !== undefined && keys.serperApiKey.trim() !== '') {
    process.env.SERPER_API_KEY = keys.serperApiKey.trim();
  }
  if (keys.tavilyApiKey !== undefined && keys.tavilyApiKey.trim() !== '') {
    process.env.TAVILY_API_KEY = keys.tavilyApiKey.trim();
  }

  // Persist to server .env file
  const cfg = getServerConfig();
  const lines = [
    `PORT=${cfg.port}`,
    `GEMINI_API_KEY=${cfg.geminiApiKey}`,
    `HUNTER_API_KEY=${cfg.hunterApiKey}`,
    `SERPER_API_KEY=${cfg.serperApiKey}`,
    `TAVILY_API_KEY=${cfg.tavilyApiKey}`,
    `BREVO_API_KEY=${cfg.brevoApiKeyEnv}`,
    `BREVO_SENDER_EMAIL=${cfg.brevoSenderEmailEnv}`,
  ];
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
}

export function clearServerApiKey(keyName: 'gemini' | 'hunter' | 'serper' | 'tavily'): void {
  if (keyName === 'gemini') {
    process.env.GEMINI_API_KEY = '';
    process.env.GOOGLE_API_KEY = '';
  } else if (keyName === 'hunter') {
    process.env.HUNTER_API_KEY = '';
  } else if (keyName === 'serper') {
    process.env.SERPER_API_KEY = '';
  } else if (keyName === 'tavily') {
    process.env.TAVILY_API_KEY = '';
  }
  saveServerApiKeys({});
}

export function getSafeApiCapabilities(brevoReady: boolean, brevoSubscribers: number) {
  const cfg = getServerConfig();
  const configuredProviders: string[] = [];
  if (cfg.geminiApiKey) configuredProviders.push('Google Gemini (gemini-3.8-flash + Search Grounding)');
  if (cfg.tavilyApiKey) configuredProviders.push('Tavily Web Search API');
  if (cfg.serperApiKey) configuredProviders.push('Serper.dev Google Search API');
  if (cfg.hunterApiKey) configuredProviders.push('Hunter.io Domain Search API');
  if (brevoReady) configuredProviders.push('Brevo Transactional Email API');

  return {
    hasGeminiKey: Boolean(cfg.geminiApiKey),
    hasTavilyKey: Boolean(cfg.tavilyApiKey),
    hasSerperKey: Boolean(cfg.serperApiKey),
    hasHunterKey: Boolean(cfg.hunterApiKey),
    hasAnySearchProvider: Boolean(
      cfg.tavilyApiKey || cfg.serperApiKey || cfg.hunterApiKey || cfg.geminiApiKey
    ),
    configuredProviders,
    brevoReady,
    brevoSubscribers,
  };
}
