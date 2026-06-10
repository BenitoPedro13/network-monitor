import { Injectable, Logger } from '@nestjs/common';
import { AlertType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { NetworkFlowInput } from './mapper.service';

const HOUR_MS = 60 * 60 * 1000;
const NO_DNS_WINDOW_MS = 5 * 60 * 1000;
const NO_DNS_THRESHOLD = 5;
const NO_DNS_DEDUP_MS = 24 * HOUR_MS;

interface DeviceDestinationGroup {
  deviceId: string;
  dstIp: string;
  serverName: string | null;
}

@Injectable()
export class FlowAnomalyService {
  private readonly logger = new Logger(FlowAnomalyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runRules(batch: NetworkFlowInput[]): Promise<void> {
    if (batch.length === 0) return;

    try {
      await this.noDnsConnection(this.noDnsGroups(batch));
    } catch (err) {
      this.logger.error(
        'Flow anomaly rules failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private noDnsGroups(batch: NetworkFlowInput[]): DeviceDestinationGroup[] {
    const groups = new Map<string, DeviceDestinationGroup>();
    for (const flow of batch) {
      if (flow.deviceId === null || flow.hadDnsQuery !== false) continue;

      const key = `${flow.deviceId}|${flow.dstIp}`;
      const group = groups.get(key);
      if (group) {
        if (group.serverName === null && flow.serverName !== null) {
          group.serverName = flow.serverName;
        }
      } else {
        groups.set(key, {
          deviceId: flow.deviceId,
          dstIp: flow.dstIp,
          serverName: flow.serverName,
        });
      }
    }
    return [...groups.values()];
  }

  private async noDnsConnection(
    groups: DeviceDestinationGroup[],
  ): Promise<void> {
    const windowStart = new Date(Date.now() - NO_DNS_WINDOW_MS);
    for (const group of groups) {
      const count = await this.prisma.networkFlow.count({
        where: {
          deviceId: group.deviceId,
          dstIp: group.dstIp,
          hadDnsQuery: false,
          startedAt: { gte: windowStart },
        },
      });
      if (count < NO_DNS_THRESHOLD) continue;

      const title = `NO_DNS_CONNECTION: ${group.dstIp}${
        group.serverName ? ` (sni: ${group.serverName})` : ''
      }`;
      const existing = await this.prisma.alert.findFirst({
        where: {
          deviceId: group.deviceId,
          type: AlertType.NO_DNS_CONNECTION,
          title,
          createdAt: { gte: new Date(Date.now() - NO_DNS_DEDUP_MS) },
        },
        select: { id: true },
      });
      if (existing) continue;

      await this.prisma.alert.create({
        data: {
          type: AlertType.NO_DNS_CONNECTION,
          title,
          description: `${count} recent flows to ${group.dstIp} had no matching DNS query in the provenance window`,
          riskScore: 55,
          deviceId: group.deviceId,
        },
      });
      this.logger.log(`Alert created: ${title} (device ${group.deviceId})`);
    }
  }
}
