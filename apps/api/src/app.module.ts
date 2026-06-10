import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GeoModule } from './geo/geo.module';
import { PrismaModule } from './prisma/prisma.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    GeoModule,
  ],
})
export class AppModule {}
