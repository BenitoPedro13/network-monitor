import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CursorService } from './cursor.service';
import { PollService } from './poll.service';
import { MapperService } from './mapper.service';
import { WriterService } from './writer.service';

@Injectable()
export class CollectorService implements OnModuleInit {
  private readonly logger = new Logger(CollectorService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
    private readonly prisma: PrismaService,
    private readonly cursor: CursorService,
    private readonly poll: PollService,
    private readonly mapper: MapperService,
    private readonly writer: WriterService,
  ) {}

  async onModuleInit(): Promise<void> {
    const intervalMs = this.config.get<number>('COLLECTOR_POLL_INTERVAL_MS', 30_000);
    await this.runPoll();
    const handle = setInterval(() => void this.runPoll(), intervalMs);
    this.scheduler.addInterval('collector-poll', handle);
  }

  private async runPoll(): Promise<void> {
    try {
      const stored = await this.cursor.getCursor();
      const since = stored ?? this.cursor.defaultCursor();

      const events = await this.poll.fetchSince(since);
      if (events.length === 0) {
        this.logger.log('No new events');
        return;
      }

      const devices = await this.prisma.device.findMany();
      const deviceMap = this.mapper.toDeviceMap(devices);
      const mapped = events
        .map((e) => this.mapper.toDnsEvent(e, deviceMap))
        .filter((e): e is NonNullable<typeof e> => e !== null);

      if (mapped.length > 0) {
        await this.writer.write(mapped);
      }

      const newest = events.reduce((max, e) => (e.time > max ? e.time : max), '');
      await this.cursor.setCursor(newest);
    } catch (err) {
      this.logger.error('Poll failed', err instanceof Error ? err.stack : String(err));
    }
  }
}
