import { Module } from '@nestjs/common';
import { LookupService } from './lookup.service';
import { CacheService } from './cache.service';
import { UpdaterService } from './updater.service';

@Module({
  providers: [LookupService, CacheService, UpdaterService],
  exports: [CacheService],
})
export class GeoModule {}
