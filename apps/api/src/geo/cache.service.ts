import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LookupService, GeoResult } from './lookup.service';

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class CacheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: LookupService,
  ) {}

  async enrich(ip: string): Promise<GeoResult | null> {
    if (this.lookup.isPrivate(ip)) return null;

    const cached = await this.prisma.ipGeoCache.findUnique({ where: { ip } });
    if (cached && Date.now() - cached.resolvedAt.getTime() < TTL_MS) {
      return {
        country: cached.country,
        countryCode: cached.countryCode,
        city: cached.city,
        lat: cached.lat,
        lon: cached.lon,
        asn: cached.asn,
        isp: cached.isp,
      };
    }

    const result = this.lookup.lookup(ip);

    await this.prisma.ipGeoCache.upsert({
      where: { ip },
      update: { ...result, resolvedAt: new Date() },
      create: { ip, ...result, resolvedAt: new Date() },
    });

    return result;
  }
}
