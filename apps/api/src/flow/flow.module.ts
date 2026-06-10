import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { ReaderService } from './reader.service';
import { MapperService } from './mapper.service';
import { WriterService } from './writer.service';
import { FlowService } from './flow.service';

@Module({
  imports: [GeoModule],
  providers: [ReaderService, MapperService, WriterService, FlowService],
})
export class FlowModule {}
