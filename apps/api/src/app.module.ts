import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GeoModule } from './geo/geo.module';
import { PrismaModule } from './prisma/prisma.module';
import { CollectorModule } from './collector/collector.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    GeoModule,
    CollectorModule,
  ],
})
export class AppModule {}
