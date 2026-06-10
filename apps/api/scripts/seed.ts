import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const device = await prisma.device.upsert({
    where: { ipAddress: "192.168.1.10" },
    update: {
      name: "mac-mini-monitor",
      owner: "benito",
      deviceType: "desktop"
    },
    create: {
      name: "mac-mini-monitor",
      ipAddress: "192.168.1.10",
      owner: "benito",
      deviceType: "desktop"
    }
  });

  await prisma.dnsEvent.create({
    data: {
      queriedHost: "api.github.com",
      queryType: "A",
      sourceIp: device.ipAddress,
      queriedAt: new Date(),
      deviceId: device.id
    }
  });

  await prisma.alert.create({
    data: {
      type: "UNKNOWN_DOMAIN",
      title: "Novo dominio detectado",
      description: "Dominio ainda nao mapeado no baseline",
      riskScore: 40,
      deviceId: device.id
    }
  });

  console.log("[db:seed] Seed concluido com sucesso.");
}

main()
  .catch((error: unknown) => {
    console.error("[db:seed] Falhou:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
