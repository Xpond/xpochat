type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const getEnv = (key: string, defaultValue: string = '') => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
};

class Logger {
  private enabled = getEnv('LOG_ENABLED', 'true') !== 'false';
  private level: LogLevel = (getEnv('LOG_LEVEL', 'info') as LogLevel);
  private levels = { debug: 0, info: 1, warn: 2, error: 3 };

  private shouldLog(level: LogLevel): boolean {
    return this.enabled && this.levels[level] >= this.levels[this.level];
  }

  private format(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    return `${prefix} ${message} ${args.length ? JSON.stringify(args) : ''}`;
  }

  debug(message: string, ...args: any[]) {
    if (this.shouldLog('debug')) console.log(this.format('debug', message, ...args));
  }

  info(message: string, ...args: any[]) {
    if (this.shouldLog('info')) console.log(this.format('info', message, ...args));
  }

  warn(message: string, ...args: any[]) {
    if (this.shouldLog('warn')) console.warn(this.format('warn', message, ...args));
  }

  error(message: string, ...args: any[]) {
    if (this.shouldLog('error')) console.error(this.format('error', message, ...args));
  }

  toggle(enabled?: boolean) {
    this.enabled = enabled ?? !this.enabled;
  }
}

export const log = new Logger(); 