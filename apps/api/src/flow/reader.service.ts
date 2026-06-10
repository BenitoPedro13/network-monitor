import { Injectable, Logger } from '@nestjs/common';
import { open, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

const CURSOR_KEY = 'flow_cursor';
const NEWLINE = 0x0a;

export interface FlowCursor {
  conn: number;
  ssl: number;
}

export interface ZeekConnRecord {
  ts: number;
  uid: string;
  'id.orig_h': string;
  'id.orig_p': number;
  'id.resp_h': string;
  'id.resp_p': number;
  proto: string;
  service?: string;
  duration?: number;
  orig_bytes?: number;
  resp_bytes?: number;
  conn_state?: string;
}

export interface ZeekSslRecord {
  uid: string;
  server_name?: string;
}

export interface FlowBatch {
  conn: ZeekConnRecord[];
  ssl: ZeekSslRecord[];
  next: FlowCursor;
}

export function zeekLogDir(): string {
  const root = process.env['INIT_CWD'] ?? process.cwd();
  return resolve(root, 'zeek/logs');
}

@Injectable()
export class ReaderService {
  private readonly logger = new Logger(ReaderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCursor(): Promise<FlowCursor> {
    const row = await this.prisma.systemState.findUnique({
      where: { key: CURSOR_KEY },
    });
    if (!row) return { conn: 0, ssl: 0 };
    const parsed: unknown = JSON.parse(row.value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as FlowCursor).conn === 'number' &&
      typeof (parsed as FlowCursor).ssl === 'number'
    ) {
      return parsed as FlowCursor;
    }
    return { conn: 0, ssl: 0 };
  }

  async setCursor(cursor: FlowCursor): Promise<void> {
    const value = JSON.stringify(cursor);
    await this.prisma.systemState.upsert({
      where: { key: CURSOR_KEY },
      update: { value },
      create: { key: CURSOR_KEY, value },
    });
  }

  async readSince(cursor: FlowCursor): Promise<FlowBatch> {
    const dir = zeekLogDir();
    const conn = await this.readNewLines(resolve(dir, 'conn.log'), cursor.conn);
    const ssl = await this.readNewLines(resolve(dir, 'ssl.log'), cursor.ssl);

    return {
      conn: this.parseLines<ZeekConnRecord>(conn.lines, 'conn.log'),
      ssl: this.parseLines<ZeekSslRecord>(ssl.lines, 'ssl.log'),
      next: { conn: conn.next, ssl: ssl.next },
    };
  }

  private async readNewLines(
    path: string,
    offset: number,
  ): Promise<{ lines: string[]; next: number }> {
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      return { lines: [], next: 0 };
    }

    // Zeek restart truncates/recreates the log — a shrunken file means start over
    const start = size < offset ? 0 : offset;
    if (size === start) return { lines: [], next: start };

    const handle = await open(path, 'r');
    try {
      const buf = Buffer.alloc(size - start);
      await handle.read(buf, 0, buf.length, start);
      const lastNewline = buf.lastIndexOf(NEWLINE);
      if (lastNewline === -1) return { lines: [], next: start };
      const lines = buf
        .subarray(0, lastNewline)
        .toString('utf8')
        .split('\n')
        .filter((l) => l.length > 0);
      return { lines, next: start + lastNewline + 1 };
    } finally {
      await handle.close();
    }
  }

  private parseLines<T>(lines: string[], source: string): T[] {
    const records: T[] = [];
    for (const line of lines) {
      try {
        records.push(JSON.parse(line) as T);
      } catch {
        this.logger.warn(
          `Skipping malformed ${source} line: ${line.slice(0, 200)}`,
        );
      }
    }
    return records;
  }
}
