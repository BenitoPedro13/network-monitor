import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { PollService } from './poll.service';
import { MapperService } from './mapper.service';
import { CursorService } from './cursor.service';
import { WriterService } from './writer.service';
import { CollectorService } from './collector.service';

@Module({
  imports: [GeoModule],
  providers: [PollService, MapperService, CursorService, WriterService, CollectorService],
})
export class CollectorModule {}
