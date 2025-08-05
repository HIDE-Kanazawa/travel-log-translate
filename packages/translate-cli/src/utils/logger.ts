/**
 * Logger utility for structured logging
 */
export class Logger {
  constructor(private jsonMode = false) {}

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  private log(
    level: 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>
  ): void {
    const timestamp = new Date().toISOString();

    if (this.jsonMode) {
      const logEntry = {
        timestamp,
        level,
        message,
        ...data,
      };
      console.log(JSON.stringify(logEntry));
    } else {
      const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
      const formattedData = data ? ` ${JSON.stringify(data, null, 2)}` : '';
      console.log(`${prefix} ${message}${formattedData}`);
    }
  }
}
