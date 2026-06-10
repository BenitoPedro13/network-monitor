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
    if (cursor) url.searchParams.set('older_than', cursor);

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
    this.logger.debug(`Fetched ${body.data.length} events from AdGuard`);
    return body.data;
  }
}
