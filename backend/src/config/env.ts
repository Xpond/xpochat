import { log } from '../utils/logger';

interface Config {
  // Server
  PORT: number;
  HOST: string;
  NODE_ENV: string;
  
  // Authentication
  CLERK_SECRET_KEY?: string;
  
  // AI Providers
  OPENROUTER_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  
  // Database (DragonflyDB/Redis)
  REDIS_HOST: string;
  REDIS_PORT: number;
  
  // === New Neon & Cloudinary ===
  DATABASE_URL: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  
  // Logging
  LOG_ENABLED: boolean;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

const getEnv = (key: string, defaultValue?: string): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]!;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Environment variable ${key} is required but not set`);
};

const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
  const value = getEnv(key, defaultValue.toString());
  return value.toLowerCase() === 'true';
};

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = getEnv(key, defaultValue.toString());
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return num;
};

// Load and validate configuration
const loadConfig = (): Config => {
  try {
    const config: Config = {
      // Server configuration
      PORT: getEnvNumber('PORT', 3001),
      HOST: getEnv('HOST', '::'),
      NODE_ENV: getEnv('NODE_ENV', 'development'),
      
      // Authentication (optional for development)
      CLERK_SECRET_KEY: getEnv('CLERK_SECRET_KEY', ''),
      
      // AI Providers
      OPENROUTER_API_KEY: getEnv('OPENROUTER_API_KEY', ''),
      ELEVENLABS_API_KEY: getEnv('ELEVENLABS_API_KEY', ''),
      
      // Database configuration
      REDIS_HOST: getEnv('REDIS_HOST', 'localhost'),
      REDIS_PORT: getEnvNumber('REDIS_PORT', 6379),
      
      // Neon & Cloudinary
      DATABASE_URL: getEnv('DATABASE_URL'),
      CLOUDINARY_CLOUD_NAME: getEnv('CLOUDINARY_CLOUD_NAME', ''),
      CLOUDINARY_API_KEY: getEnv('CLOUDINARY_API_KEY', ''),
      CLOUDINARY_API_SECRET: getEnv('CLOUDINARY_API_SECRET', ''),
      
      // Logging configuration
      LOG_ENABLED: getEnvBoolean('LOG_ENABLED', true),
      LOG_LEVEL: getEnv('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error'
    };

    // Validate log level
    if (!['debug', 'info', 'warn', 'error'].includes(config.LOG_LEVEL)) {
      throw new Error('LOG_LEVEL must be one of: debug, info, warn, error');
    }

    return config;
  } catch (error) {
    console.error('Configuration error:', error);
    process.exit(1);
  }
};

export const config = loadConfig();

// Log configuration (only if logging is enabled)
if (config.LOG_ENABLED) {
  log.info('Configuration loaded', {
    port: config.PORT,
    host: config.HOST,
    env: config.NODE_ENV,
    clerkEnabled: !!config.CLERK_SECRET_KEY,
    openrouterEnabled: !!config.OPENROUTER_API_KEY,
    elevenlabsEnabled: !!config.ELEVENLABS_API_KEY,
    redisHost: config.REDIS_HOST,
    redisPort: config.REDIS_PORT,
    databaseUrl: !!config.DATABASE_URL,
    cloudinaryEnabled: !!config.CLOUDINARY_CLOUD_NAME && !!config.CLOUDINARY_API_KEY,
    logLevel: config.LOG_LEVEL
  });
} 