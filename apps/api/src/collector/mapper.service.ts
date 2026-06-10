import { Injectable } from '@nestjs/common';
import type { Device } from '@prisma/client';
import type { AdGuardEvent } from './poll.service';

export interface DnsEventInput {
  queriedHost: string;
  queryType: string;
  sourceIp: string;
  responseIp: string | null;
  blocked: boolean;
  queriedAt: Date;
  deviceId: string;
}

@Injectable()
export class MapperService {
  toDeviceMap(devices: Device[]): Map<string, string> {
    return new Map(devices.map((d) => [d.ipAddress, d.id]));
  }

  countUnknownClients(
    events: AdGuardEvent[],
    deviceMap: Map<string, string>,
  ): Map<string, number> {
    const unknown = new Map<string, number>();
    for (const event of events) {
      if (deviceMap.has(event.client)) continue;
      unknown.set(event.client, (unknown.get(event.client) ?? 0) + 1);
    }
    return unknown;
  }

  toDnsEvent(
    event: AdGuardEvent,
    deviceMap: Map<string, string>,
  ): DnsEventInput | null {
    const deviceId = deviceMap.get(event.client);
    if (!deviceId) return null;

    const responseIp =
      event.answer?.find((a) => a.type === 'A' || a.type === 'AAAA')?.value ??
      null;

    return {
      queriedHost: event.question.name,
      queryType: event.question.type,
      sourceIp: event.client,
      responseIp,
      blocked: event.reason.startsWith('Filtered'),
      queriedAt: new Date(event.time),
      deviceId,
    };
  }
}
