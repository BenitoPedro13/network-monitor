import { Injectable, Logger } from '@nestjs/common';
import { AlertType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DnsEventInput } from '../mapper.service';

const HOUR_MS = 60 * 60 * 1000;

const UNKNOWN_DOMAIN_LOOKBACK_MS = 30 * 24 * HOUR_MS;
const UNKNOWN_DOMAIN_DEDUP_MS = 24 * HOUR_MS;
const HIGH_FREQUENCY_WINDOW_MS = 5 * 60 * 1000;
const HIGH_FREQUENCY_THRESHOLD = 100;
const HIGH_FREQUENCY_DEDUP_MS = HOUR_MS;
const THREAT_MATCH_DEDUP_MS = 24 * HOUR_MS;

interface DeviceHostGroup {
  deviceId: string;
  queriedHost: string;
  events: DnsEventInput[];
}

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runRules(batch: DnsEventInput[]): Promise<void> {
    if (batch.length === 0) return;

    const groups = this.groupByDeviceHost(batch);
    try {
      await this.unknownDomain(groups);
      await this.highFrequency(groups);
      await this.threatMatch(groups);
    } catch (err) {
      this.logger.error(
        'Anomaly rules failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private groupByDeviceHost(batch: DnsEventInput[]): DeviceHostGroup[] {
    const groups = new Map<string, DeviceHostGroup>();
    for (const event of batch) {
      const key = `${event.deviceId} ${event.queriedHost}`;
      const group = groups.get(key);
      if (group) {
        group.events.push(event);
      } else {
        groups.set(key, {
          deviceId: event.deviceId,
          queriedHost: event.queriedHost,
          events: [event],
        });
      }
    }
    return [...groups.values()];
  }

  private async unknownDomain(groups: DeviceHostGroup[]): Promise<void> {
    const now = Date.now();
    for (const group of groups) {
      const oldestInBatch = new Date(
        Math.min(...group.events.map((e) => e.queriedAt.getTime())),
      );
      const priorCount = await this.prisma.dnsEvent.count({
        where: {
          deviceId: group.deviceId,
          queriedHost: group.queriedHost,
          queriedAt: {
            gte: new Date(now - UNKNOWN_DOMAIN_LOOKBACK_MS),
            lt: oldestInBatch,
          },
        },
      });
      if (priorCount > 0) continue;

      await this.createAlert(group, {
        type: AlertType.UNKNOWN_DOMAIN,
        riskScore: 30,
        dedupMs: UNKNOWN_DOMAIN_DEDUP_MS,
        description: `First query to ${group.queriedHost} from this device in the last 30 days`,
      });
    }
  }

  private async highFrequency(groups: DeviceHostGroup[]): Promise<void> {
    const windowStart = new Date(Date.now() - HIGH_FREQUENCY_WINDOW_MS);
    for (const group of groups) {
      const count = await this.prisma.dnsEvent.count({
        where: {
          deviceId: group.deviceId,
          queriedHost: group.queriedHost,
          queriedAt: { gte: windowStart },
        },
      });
      if (count <= HIGH_FREQUENCY_THRESHOLD) continue;

      await this.createAlert(group, {
        type: AlertType.HIGH_FREQUENCY,
        riskScore: 65,
        dedupMs: HIGH_FREQUENCY_DEDUP_MS,
        description: `${count} queries to ${group.queriedHost} in the last 5 minutes`,
      });
    }
  }

  private async threatMatch(groups: DeviceHostGroup[]): Promise<void> {
    for (const group of groups) {
      if (!group.events.some((e) => e.blocked)) continue;

      await this.createAlert(group, {
        type: AlertType.THREAT_MATCH,
        riskScore: 80,
        dedupMs: THREAT_MATCH_DEDUP_MS,
        description: `Query to ${group.queriedHost} was blocked by AdGuard filters`,
      });
    }
  }

  private async createAlert(
    group: DeviceHostGroup,
    rule: {
      type: AlertType;
      riskScore: number;
      dedupMs: number;
      description: string;
    },
  ): Promise<void> {
    // Alert has no queriedHost column — the host lives in the title, and dedup
    // matches on (deviceId, type, title) within the rule's window
    const title = `${rule.type}: ${group.queriedHost}`;

    const existing = await this.prisma.alert.findFirst({
      where: {
        deviceId: group.deviceId,
        type: rule.type,
        title,
        createdAt: { gte: new Date(Date.now() - rule.dedupMs) },
      },
      select: { id: true },
    });
    if (existing) return;

    await this.prisma.alert.create({
      data: {
        type: rule.type,
        title,
        description: rule.description,
        riskScore: rule.riskScore,
        deviceId: group.deviceId,
      },
    });
    this.logger.log(`Alert created: ${title} (device ${group.deviceId})`);
  }
}
