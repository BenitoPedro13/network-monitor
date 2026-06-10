import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AdGuardAnswer {
  type: string;
  value: string;
}

export interface AdGuardEvent {
  time: string;
  question: { name: string; type: string };
  client: string;
  status: string;
  reason: string;
  answer?: AdGuardAnswer[];
}

interface AdGuardQueryLogResponse {
  data: AdGuardEvent[];
  oldest: string;
}

@Injectable()
export class PollService {
  private readonly logger = new Logger(PollService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchSince(cursor: string | null): Promise<AdGuardEvent[]> {
    const base = this.config.getOrThrow<string>('ADGUARD_URL');
    const user = this.config.getOrThrow<string>('ADGUARD_USER');
    const pass = this.config.getOrThrow<string>('ADGUARD_PASSWORD');

    const url = new URL('/control/querylog', base);
    url.searchParams.set('limit', '1000');
    url.searchParams.set('response_status', 'all');

    const credentials = Buffer.from(`${user}:${pass}`).toString('base64');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (!res.ok) {
      throw new Error(
        `AdGuard API returned ${res.status}. ` +
          `Check ADGUARD_URL, ADGUARD_USER, ADGUARD_PASSWORD and that the setup wizard is complete.`,
      );
    }

    const body = (await res.json()) as AdGuardQueryLogResponse;
    const data = body.data;
    this.logger.debug(`Fetched ${data.length} raw events from AdGuard`);
    if (!cursor) return data;
    const cursorMs = new Date(cursor).getTime();
    return data.filter((e) => new Date(e.time).getTime() > cursorMs);
  }
}
