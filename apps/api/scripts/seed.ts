import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const devices = [
  {
    name: "macbook-loopback",
    ipAddress: "127.0.0.1",
    owner: "benito",
    deviceType: "laptop"
  },
  {
    name: "macbook-loopback-v6",
    ipAddress: "::1",
    owner: "benito",
    deviceType: "laptop"
  },
  {
    name: "macbook-benito",
    ipAddress: "192.168.1.6",
    owner: "benito",
    deviceType: "laptop"
  },
  {
    name: "android-benito",
    ipAddress: "192.168.1.21",
    owner: "benito",
    deviceType: "phone"
  }
];

async function main(): Promise<void> {
  for (const device of devices) {
    await prisma.device.upsert({
      where: { ipAddress: device.ipAddress },
      update: {
        name: device.name,
        owner: device.owner,
        deviceType: device.deviceType
      },
      create: device
    });
  }

  console.log(`[db:seed] Upserted ${devices.length} devices.`);
}

main()
  .catch((error: unknown) => {
    console.error("[db:seed] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
