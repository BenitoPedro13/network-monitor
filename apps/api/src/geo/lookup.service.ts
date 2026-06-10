import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as maxmind from 'maxmind';
import type { CityResponse, AsnResponse } from 'maxmind';
import { resolve } from 'node:path';

export interface GeoResult {
  country: string | null;
  countryCode: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  asn: string | null;
  isp: string | null;
}

const PRIVATE_IP_RE =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1$|fc00:|fd)/;

function geoPaths() {
  // INIT_CWD is set by pnpm to the directory where the command was invoked (monorepo root)
  const root = process.env['INIT_CWD'] ?? process.cwd();
  return {
    city: resolve(root, 'geoip/GeoLite2-City.mmdb'),
    asn: resolve(root, 'geoip/GeoLite2-ASN.mmdb'),
  };
}

@Injectable()
export class LookupService implements OnModuleInit {
  private readonly logger = new Logger(LookupService.name);
  private cityReader: maxmind.Reader<CityResponse> | null = null;
  private asnReader: maxmind.Reader<AsnResponse> | null = null;

  async onModuleInit() {
    await this.reloadReaders();
  }

  async reloadReaders() {
    const { city, asn } = geoPaths();
    this.cityReader = await maxmind.open<CityResponse>(city);
    this.asnReader = await maxmind.open<AsnResponse>(asn);
    this.logger.log('MaxMind readers loaded');
  }

  lookup(ip: string): GeoResult | null {
    if (PRIVATE_IP_RE.test(ip)) return null;
    if (!this.cityReader || !this.asnReader) return null;

    const city = this.cityReader.get(ip);
    const asn = this.asnReader.get(ip);

    if (!city && !asn) return null;

    return {
      country: city?.country?.names?.en ?? null,
      countryCode: city?.country?.iso_code ?? null,
      city: city?.city?.names?.en ?? null,
      lat: city?.location?.latitude ?? null,
      lon: city?.location?.longitude ?? null,
      asn: asn?.autonomous_system_number
        ? `AS${asn.autonomous_system_number}`
        : null,
      isp: asn?.autonomous_system_organization ?? null,
    };
  }

  isPrivate(ip: string): boolean {
    return PRIVATE_IP_RE.test(ip);
  }
}
