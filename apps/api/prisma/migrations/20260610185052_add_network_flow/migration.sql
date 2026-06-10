-- CreateTable
CREATE TABLE "NetworkFlow" (
    "id" TEXT NOT NULL,
    "uid" TEXT,
    "srcIp" TEXT NOT NULL,
    "dstIp" TEXT NOT NULL,
    "dstPort" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL,
    "service" TEXT,
    "serverName" TEXT,
    "bytes" BIGINT NOT NULL,
    "duration" DOUBLE PRECISION,
    "connState" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "deviceId" TEXT,
    "hadDnsQuery" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NetworkFlow_uid_key" ON "NetworkFlow"("uid");

-- CreateIndex
CREATE INDEX "NetworkFlow_deviceId_startedAt_idx" ON "NetworkFlow"("deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "NetworkFlow_dstIp_startedAt_idx" ON "NetworkFlow"("dstIp", "startedAt");
