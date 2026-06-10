import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MapperService } from '../src/collector/mapper.service';
import type { AdGuardEvent } from '../src/collector/poll.service';

const mapper = new MapperService();

const baseEvent: AdGuardEvent = {
  time: '2026-06-10T00:00:00.000Z',
  question: { name: 'api.github.com', type: 'A' },
  client: '192.168.1.10',
  status: 'NOERROR',
  reason: 'NotFilteredNotFound',
  answer: [{ type: 'A', value: '140.82.112.5' }],
};

const deviceMap = new Map([['192.168.1.10', 'device-id-1']]);

describe('MapperService', () => {
  describe('toDeviceMap', () => {
    it('builds ip → deviceId map from device list', () => {
      const devices = [
        { id: 'abc', ipAddress: '192.168.1.10' },
        { id: 'def', ipAddress: '192.168.1.11' },
      ] as any;
      const map = mapper.toDeviceMap(devices);
      assert.equal(map.get('192.168.1.10'), 'abc');
      assert.equal(map.get('192.168.1.11'), 'def');
    });
  });

  describe('countUnknownClients', () => {
    it('aggregates counts per unregistered IP', () => {
      const events = [
        baseEvent,
        { ...baseEvent, client: '149.112.112.10' },
        { ...baseEvent, client: '149.112.112.10' },
        { ...baseEvent, client: '10.0.0.99' },
      ];
      const unknown = mapper.countUnknownClients(events, deviceMap);
      assert.equal(unknown.size, 2);
      assert.equal(unknown.get('149.112.112.10'), 2);
      assert.equal(unknown.get('10.0.0.99'), 1);
      assert.equal(unknown.has('192.168.1.10'), false);
    });

    it('returns an empty map when all clients are registered', () => {
      const unknown = mapper.countUnknownClients([baseEvent, baseEvent], deviceMap);
      assert.equal(unknown.size, 0);
    });
  });

  describe('toDnsEvent', () => {
    it('maps a standard event correctly', () => {
      const result = mapper.toDnsEvent(baseEvent, deviceMap);
      assert.ok(result);
      assert.equal(result.queriedHost, 'api.github.com');
      assert.equal(result.queryType, 'A');
      assert.equal(result.sourceIp, '192.168.1.10');
      assert.equal(result.responseIp, '140.82.112.5');
      assert.equal(result.blocked, false);
      assert.equal(result.deviceId, 'device-id-1');
      assert.deepEqual(result.queriedAt, new Date('2026-06-10T00:00:00.000Z'));
    });

    it('returns null for unknown source IP', () => {
      const result = mapper.toDnsEvent(
        { ...baseEvent, client: '10.0.0.99' },
        deviceMap,
      );
      assert.equal(result, null);
    });

    it('sets blocked=true when reason starts with Filtered', () => {
      const result = mapper.toDnsEvent(
        { ...baseEvent, reason: 'FilteredBlackList' },
        deviceMap,
      );
      assert.ok(result);
      assert.equal(result.blocked, true);
    });

    it('sets responseIp=null when no A/AAAA answer', () => {
      const result = mapper.toDnsEvent(
        { ...baseEvent, answer: [{ type: 'CNAME', value: 'alias.example.com' }] },
        deviceMap,
      );
      assert.ok(result);
      assert.equal(result.responseIp, null);
    });

    it('sets responseIp=null when answer array is missing', () => {
      const { answer: _, ...eventWithoutAnswer } = baseEvent;
      const result = mapper.toDnsEvent(eventWithoutAnswer, deviceMap);
      assert.ok(result);
      assert.equal(result.responseIp, null);
    });

    it('picks AAAA answer when present', () => {
      const result = mapper.toDnsEvent(
        { ...baseEvent, answer: [{ type: 'AAAA', value: '2606:4700::1' }] },
        deviceMap,
      );
      assert.ok(result);
      assert.equal(result.responseIp, '2606:4700::1');
    });
  });
});
