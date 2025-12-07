import { PrismaClient } from "../prisma/generated/client";

// 直接使用数据库URL连接，不依赖环境变量
const DATABASE_URL =
  "file:/Users/zhao/Documents/01.Code/Hex/teatime-ai/apps/server/local.db";

// 创建prisma客户端实例
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function seed() {
  try {
    // 删除现有数据
    await prisma.page.deleteMany();

    // 创建测试页面
    const page1 = await prisma.page.create({
      data: {
        title: "Document 1",
        isExpanded: false,
        children: {
          create: [
            {
              title: "Document 1.1",
              isExpanded: false,
            },
            {
              title: "Document 1.2",
              isExpanded: false,
              children: {
                create: [
                  {
                    title: "Document 1.2.1",
                    isExpanded: false,
                  },
                ],
              },
            },
          ],
        },
      },
    });

    const page2 = await prisma.page.create({
      data: {
        title: "Document 2",
        isExpanded: false,
      },
    });

    console.log("Seeded database with test pages");
    console.log("Page 1:", page1.title);
    console.log("Page 2:", page2.title);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
