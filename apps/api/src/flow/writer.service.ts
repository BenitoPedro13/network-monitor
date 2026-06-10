import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../geo/cache.service';
import type { NetworkFlowInput } from './mapper.service';
import type { ZeekSslRecord } from './reader.service';

const DNS_WINDOW_MS = 60 * 60 * 1000;
// ssl.log lands at handshake time, conn.log at connection end — allow slight reordering
const CLOCK_SKEW_MS = 60 * 1000;
const PENDING_SNI_MAX = 10_000;

@Injectable()
export class WriterService {
  private readonly logger = new Logger(WriterService.name);
  // SNI for connections whose conn.log line hasn't been ingested yet (ssl.log arrives first)
  private readonly pendingSni = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: CacheService,
  ) {}

  async write(
    flows: NetworkFlowInput[],
    ssl: ZeekSslRecord[],
  ): Promise<{ written: number }> {
    for (const record of ssl) {
      if (record.server_name) this.pendingSni.set(record.uid, record.server_name);
    }

    const batchUids = new Set(flows.map((f) => f.uid));
    for (const flow of flows) {
      flow.serverName = this.pendingSni.get(flow.uid) ?? null;
      if (flow.serverName !== null) this.pendingSni.delete(flow.uid);
    }

    await this.enrichDnsProvenance(flows);

    const uniqueIps = [...new Set(flows.map((f) => f.dstIp))];
    await Promise.all(uniqueIps.map((ip) => this.geo.enrich(ip)));

    let written = 0;
    if (flows.length > 0) {
      const result = await this.prisma.networkFlow.createMany({
        data: flows,
        skipDuplicates: true,
      });
      written = result.count;
      this.logger.log(
        `Wrote ${result.count}/${flows.length} flows (${flows.length - result.count} duplicates skipped)`,
      );
    }

    await this.applyLateSni(ssl, batchUids);
    this.prunePendingSni();

    return { written };
  }

  private async enrichDnsProvenance(flows: NetworkFlowInput[]): Promise<void> {
    const candidates = flows.filter((f) => f.deviceId !== null);
    if (candidates.length === 0) return;

    const dstIps = [...new Set(candidates.map((f) => f.dstIp))];
    const earliest = new Date(
      Math.min(...candidates.map((f) => f.startedAt.getTime())) - DNS_WINDOW_MS,
    );
    const events = await this.prisma.dnsEvent.findMany({
      where: { responseIp: { in: dstIps }, queriedAt: { gte: earliest } },
      select: { deviceId: true, responseIp: true, queriedAt: true },
    });

    const queryTimes = new Map<string, number[]>();
    for (const event of events) {
      const key = `${event.deviceId}|${event.responseIp}`;
      const times = queryTimes.get(key);
      if (times) times.push(event.queriedAt.getTime());
      else queryTimes.set(key, [event.queriedAt.getTime()]);
    }

    for (const flow of candidates) {
      const started = flow.startedAt.getTime();
      const times = queryTimes.get(`${flow.deviceId}|${flow.dstIp}`) ?? [];
      flow.hadDnsQuery = times.some(
        (t) => t >= started - DNS_WINDOW_MS && t <= started + CLOCK_SKEW_MS,
      );
    }
  }

  private async applyLateSni(
    ssl: ZeekSslRecord[],
    batchUids: Set<string>,
  ): Promise<void> {
    for (const record of ssl) {
      if (!record.server_name || batchUids.has(record.uid)) continue;
      const result = await this.prisma.networkFlow.updateMany({
        where: { uid: record.uid, serverName: null },
        data: { serverName: record.server_name },
      });
      if (result.count > 0) this.pendingSni.delete(record.uid);
    }
  }

  private prunePendingSni(): void {
    while (this.pendingSni.size > PENDING_SNI_MAX) {
      const oldest = this.pendingSni.keys().next().value;
      if (oldest === undefined) break;
      this.pendingSni.delete(oldest);
    }
  }
}
