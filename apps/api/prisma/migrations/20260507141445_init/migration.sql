-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('UNKNOWN_DOMAIN', 'HIGH_FREQUENCY', 'THREAT_MATCH');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "macAddress" TEXT,
    "owner" TEXT,
    "deviceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DnsEvent" (
    "id" TEXT NOT NULL,
    "queriedHost" TEXT NOT NULL,
    "queryType" TEXT NOT NULL DEFAULT 'A',
    "sourceIp" TEXT NOT NULL,
    "responseIp" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "queriedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL,

    CONSTRAINT "DnsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deviceId" TEXT NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_ipAddress_key" ON "Device"("ipAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Device_macAddress_key" ON "Device"("macAddress");

-- CreateIndex
CREATE INDEX "DnsEvent_deviceId_queriedAt_idx" ON "DnsEvent"("deviceId", "queriedAt");

-- CreateIndex
CREATE INDEX "DnsEvent_queriedHost_queriedAt_idx" ON "DnsEvent"("queriedHost", "queriedAt");

-- CreateIndex
CREATE INDEX "Alert_deviceId_status_idx" ON "Alert"("deviceId", "status");

-- AddForeignKey
ALTER TABLE "DnsEvent" ADD CONSTRAINT "DnsEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
