import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const CURSOR_KEY = 'collector_cursor';

@Injectable()
export class CursorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getCursor(): Promise<string | null> {
    const row = await this.prisma.systemState.findUnique({
      where: { key: CURSOR_KEY },
    });
    return row?.value ?? null;
  }

  async setCursor(timestamp: string): Promise<void> {
    await this.prisma.systemState.upsert({
      where: { key: CURSOR_KEY },
      update: { value: timestamp },
      create: { key: CURSOR_KEY, value: timestamp },
    });
  }

  defaultCursor(): string {
    const backfillHours = this.config.get<number>(
      'COLLECTOR_BACKFILL_HOURS',
      24,
    );
    return new Date(Date.now() - backfillHours * 3_600_000).toISOString();
  }
}
