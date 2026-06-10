import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../geo/cache.service';
import type { DnsEventInput } from './mapper.service';

@Injectable()
export class WriterService {
  private readonly logger = new Logger(WriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: CacheService,
  ) {}

  async write(events: DnsEventInput[]): Promise<{ written: number }> {
    if (events.length === 0) return { written: 0 };

    // Enrich unique response IPs with geo data (hits IpGeoCache or MaxMind)
    const uniqueIps = [
      ...new Set(events.map((e) => e.responseIp).filter((ip): ip is string => ip !== null)),
    ];
    await Promise.all(uniqueIps.map((ip) => this.geo.enrich(ip)));

    const result = await this.prisma.dnsEvent.createMany({
      data: events,
      skipDuplicates: true,
    });

    this.logger.log(
      `Wrote ${result.count}/${events.length} events (${events.length - result.count} duplicates skipped)`,
    );

    return { written: result.count };
  }
}
