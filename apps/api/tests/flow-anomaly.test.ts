import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FlowAnomalyService } from '../src/flow/anomaly.service';
import type { NetworkFlowInput } from '../src/flow/mapper.service';

function makeFlow(
  overrides: Partial<NetworkFlowInput> = {},
): NetworkFlowInput {
  return {
    uid: 'flow-1',
    srcIp: '192.168.1.6',
    dstIp: '9.9.9.10',
    dstPort: 443,
    protocol: 'tcp',
    service: 'ssl',
    serverName: 'dns10.quad9.net',
    bytes: 1200n,
    duration: 0.2,
    connState: 'SF',
    startedAt: new Date(),
    deviceId: 'device-1',
    hadDnsQuery: false,
    ...overrides,
  };
}

function makeService(
  opts: { recentCount?: number; existingAlert?: boolean } = {},
) {
  const created: {
    type: string;
    title: string;
    deviceId: string;
    riskScore: number;
  }[] = [];
  const prisma = {
    networkFlow: {
      count: async () => opts.recentCount ?? 0,
    },
    alert: {
      findFirst: async () =>
        opts.existingAlert ? { id: 'existing-alert' } : null,
      create: async ({ data }: any) => {
        created.push(data);
        return data;
      },
    },
  };
  return { service: new FlowAnomalyService(prisma as any), created };
}

describe('FlowAnomalyService', () => {
  it('does nothing for an empty batch', async () => {
    const { service, created } = makeService();
    await service.runRules([]);
    assert.equal(created.length, 0);
  });

  it('creates NO_DNS_CONNECTION after repeated no-DNS flows', async () => {
    const { service, created } = makeService({ recentCount: 5 });
    await service.runRules([makeFlow()]);
    assert.equal(created.length, 1);
    assert.equal(created[0]?.type, 'NO_DNS_CONNECTION');
    assert.equal(
      created[0]?.title,
      'NO_DNS_CONNECTION: 9.9.9.10 (sni: dns10.quad9.net)',
    );
    assert.equal(created[0]?.riskScore, 55);
    assert.equal(created[0]?.deviceId, 'device-1');
  });

  it('skips when recent flow count is below threshold', async () => {
    const { service, created } = makeService({ recentCount: 4 });
    await service.runRules([makeFlow()]);
    assert.equal(created.length, 0);
  });

  it('skips unknown-device and DNS-matched flows', async () => {
    const { service, created } = makeService({ recentCount: 20 });
    await service.runRules([
      makeFlow({ deviceId: null }),
      makeFlow({ hadDnsQuery: true }),
      makeFlow({ hadDnsQuery: null }),
    ]);
    assert.equal(created.length, 0);
  });

  it('dedups by device, destination, and title', async () => {
    const { service, created } = makeService({
      recentCount: 10,
      existingAlert: true,
    });
    await service.runRules([makeFlow()]);
    assert.equal(created.length, 0);
  });

  it('swallows rule errors so the flow poll loop keeps running', async () => {
    const prisma = {
      networkFlow: {
        count: async () => {
          throw new Error('db down');
        },
      },
      alert: { findFirst: async () => null, create: async () => ({}) },
    };
    const service = new FlowAnomalyService(prisma as any);
    await assert.doesNotReject(service.runRules([makeFlow()]));
  });
});
