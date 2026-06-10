import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MapperService } from '../src/flow/mapper.service';
import type { ZeekConnRecord } from '../src/flow/reader.service';

const mapper = new MapperService();

const baseRecord: ZeekConnRecord = {
  ts: 1781460000.123,
  uid: 'CAbcDe1FgHiJ2kLm3n',
  'id.orig_h': '192.168.1.6',
  'id.orig_p': 52341,
  'id.resp_h': '140.82.112.5',
  'id.resp_p': 443,
  proto: 'tcp',
  service: 'ssl',
  duration: 12.5,
  orig_bytes: 1024,
  resp_bytes: 8192,
  conn_state: 'SF',
};

const deviceMap = new Map([['192.168.1.6', 'device-mac']]);

describe('flow MapperService', () => {
  describe('isInternetIp', () => {
    it('rejects RFC1918, loopback, link-local, multicast, broadcast', () => {
      for (const ip of [
        '10.0.0.1',
        '172.16.0.1',
        '172.31.255.1',
        '192.168.1.1',
        '127.0.0.1',
        '169.254.1.1',
        '224.0.0.251',
        '239.255.255.250',
        '255.255.255.255',
        '0.0.0.0',
        '::1',
        'fe80::1',
        'fd00::1',
        'ff02::fb',
      ]) {
        assert.equal(mapper.isInternetIp(ip), false, ip);
      }
    });

    it('accepts public IPs', () => {
      for (const ip of ['140.82.112.5', '1.1.1.1', '8.8.8.8', '2606:4700::1', '172.32.0.1']) {
        assert.equal(mapper.isInternetIp(ip), true, ip);
      }
    });
  });

  describe('toNetworkFlow', () => {
    it('maps a standard conn record', () => {
      const flow = mapper.toNetworkFlow(baseRecord, deviceMap);
      assert.ok(flow);
      assert.equal(flow.uid, 'CAbcDe1FgHiJ2kLm3n');
      assert.equal(flow.srcIp, '192.168.1.6');
      assert.equal(flow.dstIp, '140.82.112.5');
      assert.equal(flow.dstPort, 443);
      assert.equal(flow.protocol, 'tcp');
      assert.equal(flow.service, 'ssl');
      assert.equal(flow.bytes, 9216n);
      assert.equal(flow.duration, 12.5);
      assert.equal(flow.connState, 'SF');
      assert.equal(flow.deviceId, 'device-mac');
      assert.deepEqual(flow.startedAt, new Date(1781460000123));
      assert.equal(flow.serverName, null);
      assert.equal(flow.hadDnsQuery, null);
    });

    it('drops flows to non-internet destinations', () => {
      for (const dst of ['192.168.1.1', '224.0.0.251', 'fe80::1']) {
        const flow = mapper.toNetworkFlow(
          { ...baseRecord, 'id.resp_h': dst },
          deviceMap,
        );
        assert.equal(flow, null, dst);
      }
    });

    it('drops zero-byte S0 noise', () => {
      const flow = mapper.toNetworkFlow(
        {
          ...baseRecord,
          conn_state: 'S0',
          orig_bytes: 0,
          resp_bytes: 0,
        },
        deviceMap,
      );
      assert.equal(flow, null);
    });

    it('keeps S0 flows that carried bytes', () => {
      const flow = mapper.toNetworkFlow(
        { ...baseRecord, conn_state: 'S0', orig_bytes: 100, resp_bytes: 0 },
        deviceMap,
      );
      assert.ok(flow);
      assert.equal(flow.bytes, 100n);
    });

    it('keeps unknown-source flows with deviceId null', () => {
      const flow = mapper.toNetworkFlow(
        { ...baseRecord, 'id.orig_h': '192.168.1.99' },
        deviceMap,
      );
      assert.ok(flow);
      assert.equal(flow.deviceId, null);
    });

    it('defaults missing optional fields', () => {
      const {
        service: _s,
        duration: _d,
        orig_bytes: _o,
        resp_bytes: _r,
        conn_state: _c,
        ...minimal
      } = baseRecord;
      const flow = mapper.toNetworkFlow(minimal, deviceMap);
      assert.ok(flow);
      assert.equal(flow.service, null);
      assert.equal(flow.duration, null);
      assert.equal(flow.connState, null);
      assert.equal(flow.bytes, 0n);
    });
  });
});
