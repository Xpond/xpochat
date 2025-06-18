import { z } from 'zod';

const ProviderConfigSchema = z.object({
  provider: z.string(),
  baseURL: z.string().url(),
  authHeader: z.string().nullable().default('Authorization'),
  authScheme: z.string().nullable().default('Bearer'),
  // Standard OpenAI-compatible /v1/chat/completions endpoint
  apiPath: z.string().default('/api/v1/chat/completions'),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const DEFAULT_MODELS = [
    { name: 'Google Gemini 2.5 flash-lite', id: 'google/gemini-2.5-flash-lite-preview-06-17' },
    { name: 'Grok 3 Mini Beta', id: 'x-ai/grok-3-mini-beta' },
    { name: 'DeepSeek R1', id: 'deepseek/deepseek-r1-0528' },
];

export const BYOK_PROVIDERS = {
    openrouter: {
        name: "OpenRouter",
        models: [
            { name: "GPT-4o", id: "openrouter/openai/gpt-4o" },
            { name: "Claude 3.5 Sonnet", id: "openrouter/anthropic/claude-3.5-sonnet" },
            { name: "Llama 3.1 405B", id: "openrouter/meta-llama/llama-3.1-405b-instruct" },
        ]
    },
    openai: {
        name: "OpenAI",
        models: [
            { name: "GPT-4o", id: "openai/gpt-4o" },
            { name: "GPT-4 Turbo", id: "openai/gpt-4-turbo" },
            { name: "GPT-3.5 Turbo", id: "openai/gpt-3.5-turbo" },
        ]
    },
    anthropic: {
        name: "Anthropic",
        models: [
            { name: "Claude 3.5 Sonnet", id: "anthropic/claude-3.5-sonnet" },
            { name: "Claude 3 Opus", id: "anthropic/claude-3-opus-20240229" },
            { name: "Claude 3 Haiku", id: "anthropic/claude-3-haiku-20240307" },
        ]
    },
    google: {
        name: "Google AI",
        models: [
            { name: "Gemini 1.5 Pro", id: "google/gemini-1.5-pro-latest" },
            { name: "Gemini 1.5 Flash", id: "google/gemini-1.5-flash-latest" },
        ]
    },
    groq: {
        name: "Groq",
        models: [
            { name: "Llama3 70B", id: "groq/llama3-70b-8192" },
            { name: "Llama3 8B", id: "groq/llama3-8b-8192" },
            { name: "Mixtral 8x7B", id: "groq/mixtral-8x7b-32768" },
        ]
    },
    elevenlabs: {
        name: "ElevenLabs",
        models: [] // Voice only – no text models needed
    }
};

export const PROVIDERS: Record<string, ProviderConfig> = {
    openrouter: ProviderConfigSchema.parse({
        provider: 'openrouter',
        baseURL: 'https://openrouter.ai',
    }),
    openai: ProviderConfigSchema.parse({
        provider: 'openai',
        baseURL: 'https://api.openai.com',
        apiPath: '/v1/chat/completions',
    }),
    anthropic: ProviderConfigSchema.parse({
        provider: 'anthropic',
        baseURL: 'https://api.anthropic.com',
        apiPath: '/v1/messages', // Note: Anthropic has a different path
        authHeader: 'x-api-key', // And a different auth header
        authScheme: null, // And no scheme
    }),
    google: ProviderConfigSchema.parse({
        provider: 'google',
        baseURL: 'https://generativelanguage.googleapis.com',
        // Path will be /v1beta/models/{model}:streamGenerateContent?key={key}
        // This is handled in the router due to its uniqueness.
        apiPath: '/v1beta/models',
        authHeader: null,
        authScheme: null,
    }),
    groq: ProviderConfigSchema.parse({
        provider: 'groq',
        baseURL: 'https://api.groq.com/openai',
        apiPath: '/v1/chat/completions',
    }),
};

export const getProviderFromModel = (modelId: string): ProviderConfig | null => {
    const providerName = modelId.split('/')[0];
    return PROVIDERS[providerName] || null;
} 