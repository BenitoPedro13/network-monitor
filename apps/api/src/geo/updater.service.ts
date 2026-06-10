import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { LookupService } from './lookup.service';

const execFileAsync = promisify(execFile);
const MS_PER_DAY = 86_400_000;
const CHECK_INTERVAL_MS = MS_PER_DAY;

// __dirname = apps/api/src/geo — navigate up to monorepo root then into scripts/
const UPDATE_SCRIPT = resolve(__dirname, '../../../../scripts/update-geoip.sh');

@Injectable()
export class UpdaterService implements OnModuleInit {
  private readonly logger = new Logger(UpdaterService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly lookup: LookupService,
  ) {}

  async onModuleInit() {
    await this.checkAndUpdate();
  }

  @Interval(CHECK_INTERVAL_MS)
  async checkAndUpdate() {
    const root = process.env['INIT_CWD'] ?? process.cwd();
    const cityPath = resolve(root, 'geoip/GeoLite2-City.mmdb');
    const asnPath = resolve(root, 'geoip/GeoLite2-ASN.mmdb');
    const maxAgeDays = this.config.get<number>('GEO_UPDATE_INTERVAL_DAYS', 7);
    const maxAgeMs = maxAgeDays * MS_PER_DAY;

    const cityAge = await this.fileAgeMs(cityPath);
    const asnAge = await this.fileAgeMs(asnPath);

    const cityDays = cityAge !== null ? Math.floor(cityAge / MS_PER_DAY) : null;
    const asnDays = asnAge !== null ? Math.floor(asnAge / MS_PER_DAY) : null;

    this.logger.log(
      `GeoLite2-City.mmdb: ${cityDays !== null ? `${cityDays} days old — OK` : 'missing'}`,
    );
    this.logger.log(
      `GeoLite2-ASN.mmdb: ${asnDays !== null ? `${asnDays} days old — OK` : 'missing'}`,
    );

    const needsUpdate =
      cityAge === null ||
      asnAge === null ||
      cityAge > maxAgeMs ||
      asnAge > maxAgeMs;

    if (needsUpdate) {
      this.logger.log('Databases are stale — downloading updates...');
      await this.runUpdateScript();
      await this.lookup.reloadReaders();
      this.logger.log('Databases updated and readers reloaded');
    } else {
      this.logger.log('Next freshness check in 24h');
    }
  }

  private async fileAgeMs(filePath: string): Promise<number | null> {
    try {
      const s = await stat(filePath);
      return Date.now() - s.mtimeMs;
    } catch {
      return null;
    }
  }

  private async runUpdateScript() {
    const { stdout, stderr } = await execFileAsync('bash', [UPDATE_SCRIPT]);
    if (stdout) this.logger.log(stdout.trim());
    if (stderr) this.logger.warn(stderr.trim());
  }
}
