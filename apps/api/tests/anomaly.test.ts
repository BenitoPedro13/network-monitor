import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnomalyService } from '../src/collector/anomaly/anomaly.service';
import type { DnsEventInput } from '../src/collector/mapper.service';

function makeEvent(overrides: Partial<DnsEventInput> = {}): DnsEventInput {
  return {
    queriedHost: 'api.github.com',
    queryType: 'A',
    sourceIp: '192.168.1.10',
    responseIp: '140.82.112.5',
    blocked: false,
    queriedAt: new Date(),
    deviceId: 'device-1',
    ...overrides,
  };
}

// priorCount feeds unknownDomain (its count query has queriedAt.lt set);
// recentCount feeds highFrequency. Defaults make no rule fire.
function makeService(opts: {
  priorCount?: number;
  recentCount?: number;
  existingAlert?: boolean;
} = {}) {
  const created: { type: string; title: string; deviceId: string; riskScore: number }[] = [];
  const prisma = {
    dnsEvent: {
      count: async ({ where }: any) =>
        where.queriedAt.lt !== undefined ? (opts.priorCount ?? 1) : (opts.recentCount ?? 0),
    },
    alert: {
      findFirst: async () => (opts.existingAlert ? { id: 'existing-alert' } : null),
      create: async ({ data }: any) => {
        created.push(data);
        return data;
      },
    },
  };
  return { service: new AnomalyService(prisma as any), created };
}

describe('AnomalyService', () => {
  it('does nothing for an empty batch', async () => {
    const { service, created } = makeService();
    await service.runRules([]);
    assert.equal(created.length, 0);
  });

  describe('UNKNOWN_DOMAIN', () => {
    it('creates an alert when the device has no prior events for the host', async () => {
      const { service, created } = makeService({ priorCount: 0 });
      await service.runRules([makeEvent()]);
      assert.equal(created.length, 1);
      assert.equal(created[0]?.type, 'UNKNOWN_DOMAIN');
      assert.equal(created[0]?.title, 'UNKNOWN_DOMAIN: api.github.com');
      assert.equal(created[0]?.deviceId, 'device-1');
      assert.equal(created[0]?.riskScore, 30);
    });

    it('skips when prior events exist within 30 days', async () => {
      const { service, created } = makeService({ priorCount: 5 });
      await service.runRules([makeEvent()]);
      assert.equal(created.length, 0);
    });

    it('creates one alert per (device, host) pair, not per event', async () => {
      const { service, created } = makeService({ priorCount: 0 });
      await service.runRules([
        makeEvent(),
        makeEvent(),
        makeEvent({ deviceId: 'device-2' }),
        makeEvent({ queriedHost: 'other.example.com' }),
      ]);
      assert.equal(created.length, 3);
      const titles = created.map((a) => `${a.deviceId} ${a.title}`).sort();
      assert.deepEqual(titles, [
        'device-1 UNKNOWN_DOMAIN: api.github.com',
        'device-1 UNKNOWN_DOMAIN: other.example.com',
        'device-2 UNKNOWN_DOMAIN: api.github.com',
      ]);
    });
  });

  describe('HIGH_FREQUENCY', () => {
    it('creates an alert when query count exceeds the threshold', async () => {
      const { service, created } = makeService({ recentCount: 101 });
      await service.runRules([makeEvent()]);
      assert.equal(created.length, 1);
      assert.equal(created[0]?.type, 'HIGH_FREQUENCY');
      assert.equal(created[0]?.riskScore, 65);
    });

    it('skips when query count is at the threshold', async () => {
      const { service, created } = makeService({ recentCount: 100 });
      await service.runRules([makeEvent()]);
      assert.equal(created.length, 0);
    });
  });

  describe('THREAT_MATCH', () => {
    it('creates an alert when any event in the group is blocked', async () => {
      const { service, created } = makeService();
      await service.runRules([makeEvent(), makeEvent({ blocked: true })]);
      assert.equal(created.length, 1);
      assert.equal(created[0]?.type, 'THREAT_MATCH');
      assert.equal(created[0]?.riskScore, 80);
    });

    it('skips when no event is blocked', async () => {
      const { service, created } = makeService();
      await service.runRules([makeEvent()]);
      assert.equal(created.length, 0);
    });
  });

  describe('dedup', () => {
    it('skips alert creation when a matching alert exists within the window', async () => {
      const { service, created } = makeService({
        priorCount: 0,
        recentCount: 101,
        existingAlert: true,
      });
      await service.runRules([makeEvent({ blocked: true })]);
      assert.equal(created.length, 0);
    });
  });

  describe('error handling', () => {
    it('swallows rule errors so the poll loop keeps running', async () => {
      const prisma = {
        dnsEvent: {
          count: async () => {
            throw new Error('db down');
          },
        },
        alert: { findFirst: async () => null, create: async () => ({}) },
      };
      const service = new AnomalyService(prisma as any);
      await assert.doesNotReject(service.runRules([makeEvent()]));
    });
  });
});
