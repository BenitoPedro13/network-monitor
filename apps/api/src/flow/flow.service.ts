import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { ReaderService, zeekLogDir } from './reader.service';
import { MapperService } from './mapper.service';
import { WriterService } from './writer.service';
import { FlowAnomalyService } from './anomaly.service';

@Injectable()
export class FlowService implements OnModuleInit {
  private readonly logger = new Logger(FlowService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
    private readonly prisma: PrismaService,
    private readonly reader: ReaderService,
    private readonly mapper: MapperService,
    private readonly writer: WriterService,
    private readonly anomaly: FlowAnomalyService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!existsSync(resolve(zeekLogDir(), 'conn.log'))) {
      this.logger.warn(
        `No Zeek conn.log in ${zeekLogDir()} — start the sensor with: sudo scripts/zeek-sensor.sh start`,
      );
    }
    const intervalMs = this.config.get<number>('FLOW_POLL_INTERVAL_MS', 30_000);
    await this.runPoll();
    const handle = setInterval(() => void this.runPoll(), intervalMs);
    this.scheduler.addInterval('flow-poll', handle);
  }

  private async runPoll(): Promise<void> {
    try {
      const cursor = await this.reader.getCursor();
      const batch = await this.reader.readSince(cursor);
      if (batch.conn.length === 0 && batch.ssl.length === 0) {
        this.logger.log('No new flow records');
        return;
      }

      const devices = await this.prisma.device.findMany();
      const deviceMap = this.mapper.toDeviceMap(devices);
      const flows = batch.conn
        .map((r) => this.mapper.toNetworkFlow(r, deviceMap))
        .filter((f): f is NonNullable<typeof f> => f !== null);

      await this.writer.write(flows, batch.ssl);
      await this.anomaly.runRules(flows);
      await this.reader.setCursor(batch.next);
    } catch (err) {
      this.logger.error(
        'Flow poll failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
