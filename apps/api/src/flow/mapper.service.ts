import { Injectable } from '@nestjs/common';
import type { Device } from '@prisma/client';
import type { ZeekConnRecord } from './reader.service';

export interface NetworkFlowInput {
  uid: string;
  srcIp: string;
  dstIp: string;
  dstPort: number;
  protocol: string;
  service: string | null;
  serverName: string | null;
  bytes: bigint;
  duration: number | null;
  connState: string | null;
  startedAt: Date;
  deviceId: string | null;
  hadDnsQuery: boolean | null;
}

const NON_INTERNET_IP_RE =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|22[4-9]\.|23\d\.|255\.255\.255\.255$|0\.0\.0\.0$|::1$|::$|fe80:|fc00:|fd|ff)/i;

@Injectable()
export class MapperService {
  toDeviceMap(devices: Device[]): Map<string, string> {
    return new Map(devices.map((d) => [d.ipAddress, d.id]));
  }

  isInternetIp(ip: string): boolean {
    return !NON_INTERNET_IP_RE.test(ip);
  }

  toNetworkFlow(
    record: ZeekConnRecord,
    deviceMap: Map<string, string>,
  ): NetworkFlowInput | null {
    const dstIp = record['id.resp_h'];
    if (!this.isInternetIp(dstIp)) return null;

    const bytes =
      BigInt(record.orig_bytes ?? 0) + BigInt(record.resp_bytes ?? 0);
    if (record.conn_state === 'S0' && bytes === 0n) return null;

    return {
      uid: record.uid,
      srcIp: record['id.orig_h'],
      dstIp,
      dstPort: record['id.resp_p'],
      protocol: record.proto,
      service: record.service ?? null,
      serverName: null,
      bytes,
      duration: record.duration ?? null,
      connState: record.conn_state ?? null,
      startedAt: new Date(record.ts * 1000),
      deviceId: deviceMap.get(record['id.orig_h']) ?? null,
      hadDnsQuery: null,
    };
  }
}
