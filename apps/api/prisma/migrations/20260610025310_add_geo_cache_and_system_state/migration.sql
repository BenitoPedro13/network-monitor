/*
  Warnings:

  - A unique constraint covering the columns `[deviceId,queriedAt,queriedHost]` on the table `DnsEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "IpGeoCache" (
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "asn" TEXT,
    "isp" TEXT,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpGeoCache_pkey" PRIMARY KEY ("ip")
);

-- CreateTable
CREATE TABLE "SystemState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "DnsEvent_deviceId_queriedAt_queriedHost_key" ON "DnsEvent"("deviceId", "queriedAt", "queriedHost");
