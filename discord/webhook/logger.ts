/**
 * Discord Webhook Logger
 * Replaces console.log with Discord webhook-based logging
 * to avoid Val Town's console logging limits
 */

import { send } from "./send.ts";
import { CONFIG } from "../constants.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: string;
}

interface LoggerConfig {
  webhookUrl: string | null;
  context: string;
  minLevel: LogLevel;
  batchIntervalMs: number;
  maxBatchSize: number;
  includeTimestamp: boolean;
  fallbackToConsole: boolean;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_LEVEL_EMOJI: Record<LogLevel, string> = {
  debug: "\uD83D\uDD0D",
  info: "\u2139\uFE0F",
  warn: "\u26A0\uFE0F",
  error: "\u274C",
};

export class DiscordLogger {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private flushTimer: number | null = null;
  private isFlushing = false;

  constructor(config: Partial<LoggerConfig> & { context: string }) {
    this.config = {
      webhookUrl: config.webhookUrl ?? CONFIG.discordConsoleWebhook,
      context: config.context,
      minLevel: config.minLevel ?? "info",
      batchIntervalMs: config.batchIntervalMs ?? 2000,
      maxBatchSize: config.maxBatchSize ?? 15,
      includeTimestamp: config.includeTimestamp ?? true,
      fallbackToConsole: config.fallbackToConsole ?? true,
    };
  }

  debug(message: string): void {
    this.log("debug", message);
  }

  info(message: string): void {
    this.log("info", message);
  }

  warn(message: string): void {
    this.log("warn", message);
  }

  error(message: string, error?: unknown): void {
    const errorDetails = error instanceof Error
      ? `\n\`\`\`\n${error.message}\n${error.stack?.slice(0, 500) ?? "No stack"}\n\`\`\``
      : error
        ? `\n\`\`\`\n${String(error)}\n\`\`\``
        : "";
    this.log("error", message + errorDetails);
  }

  private log(level: LogLevel, message: string): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: this.config.context,
    };

    this.buffer.push(entry);

    if (level === "error") {
      this.flush();
    } else if (this.buffer.length >= this.config.maxBatchSize) {
      this.flush();
    } else {
      this.scheduleFlush();
    }

    if (this.config.fallbackToConsole) {
      console.log(`[${level.toUpperCase()}] [${this.config.context}] ${message}`);
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.config.batchIntervalMs);
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) return;
    if (!this.config.webhookUrl) {
      this.buffer = [];
      return;
    }

    this.isFlushing = true;
    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const formattedMessage = this.formatBatch(entries);
      await send(formattedMessage, this.config.webhookUrl, {
        username: `${this.config.context} Logger`,
      });
    } catch (_e) {
      if (this.config.fallbackToConsole) {
        console.error(`[${this.config.context}] Failed to flush ${entries.length} log(s) to Discord — dumping to console:`);
        console.error(this.formatBatch(entries));
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private formatBatch(entries: LogEntry[]): string {
    const lines = entries.map((entry) => {
      const emoji = LOG_LEVEL_EMOJI[entry.level];
      const time = this.config.includeTimestamp
        ? `\`${new Date(entry.timestamp).toISOString().slice(11, 19)}\` `
        : "";
      return `${emoji} ${time}${entry.message}`;
    });

    const header = `**[${this.config.context}]** - ${entries.length} log(s)`;
    return `${header}\n${lines.join("\n")}`;
  }

  /** Call at end of execution to ensure all logs are sent */
  async finalize(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

/**
 * Create a logger for a specific service/module
 */
export function createLogger(
  context: string,
  options?: Partial<Omit<LoggerConfig, "context">>,
): DiscordLogger {
  return new DiscordLogger({
    context,
    ...options,
  });
}
