import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { resolve } from 'node:path';
import { GeoModule } from './geo/geo.module';
import { PrismaModule } from './prisma/prisma.module';
import { CollectorModule } from './collector/collector.module';
import { FlowModule } from './flow/flow.module';

const envFilePath = resolve(process.env['INIT_CWD'] ?? process.cwd(), '.env');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath }),
    ScheduleModule.forRoot(),
    PrismaModule,
    GeoModule,
    CollectorModule,
    FlowModule,
  ],
})
export class AppModule {}
