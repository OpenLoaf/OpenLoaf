import "dotenv/config";

import path from "node:path";
import { pathToFileURL } from "node:url";

import { prisma } from "./index";

const WORKSPACE_ID = "4b70de76-268f-4a7a-9664-41732a4924dc";

const tags = [
  { id: "tag-ecommerce", name: "电商", color: "#FF6B6B" },
  { id: "tag-task", name: "任务", color: "#4ECDC4" },
  { id: "tag-event", name: "活动", color: "#FFE66D" },
  { id: "tag-film", name: "影视", color: "#1A535C" },
  { id: "tag-software", name: "软件", color: "#9B5DE5" },
  { id: "tag-note", name: "笔记", color: "#00BBF9" },
];

const pages = [
  {
    id: "page-ecommerce",
    title: "电商平台项目",
    icon: "🛒",
    cover: "https://example.com/ecommerce-cover.jpg",
    isExpanded: true,
    parentId: null,
    tags: ["tag-ecommerce"],
  },
  {
    id: "page-ecommerce-task1",
    title: "产品列表开发",
    icon: "📋",
    cover: null,
    isExpanded: false,
    parentId: "page-ecommerce",
    tags: ["tag-task"],
  },
  {
    id: "page-ecommerce-task2",
    title: "支付系统集成",
    icon: "💳",
    cover: null,
    isExpanded: false,
    parentId: "page-ecommerce",
    tags: ["tag-task"],
  },
  {
    id: "page-event",
    title: "年度发布会策划",
    icon: "🎉",
    cover: "https://example.com/event-cover.jpg",
    isExpanded: true,
    parentId: null,
    tags: ["tag-event"],
  },
  {
    id: "page-event-task1",
    title: "嘉宾邀请",
    icon: "📧",
    cover: null,
    isExpanded: false,
    parentId: "page-event",
    tags: ["tag-task"],
  },
  {
    id: "page-event-task2",
    title: "场地布置",
    icon: "🏟️",
    cover: null,
    isExpanded: false,
    parentId: "page-event",
    tags: ["tag-task"],
  },
  {
    id: "page-film",
    title: "短视频制作",
    icon: "🎬",
    cover: "https://example.com/film-cover.jpg",
    isExpanded: true,
    parentId: null,
    tags: ["tag-film"],
  },
  {
    id: "page-film-task1",
    title: "剧本编写",
    icon: "✍️",
    cover: null,
    isExpanded: false,
    parentId: "page-film",
    tags: ["tag-task"],
  },
  {
    id: "page-software",
    title: "移动应用开发",
    icon: "📱",
    cover: "https://example.com/software-cover.jpg",
    isExpanded: true,
    parentId: null,
    tags: ["tag-software"],
  },
  {
    id: "page-software-task1",
    title: "UI设计",
    icon: "🎨",
    cover: null,
    isExpanded: false,
    parentId: "page-software",
    tags: ["tag-task"],
  },
  {
    id: "page-software-task2",
    title: "后端API开发",
    icon: "🔌",
    cover: null,
    isExpanded: false,
    parentId: "page-software",
    tags: ["tag-task"],
  },
  {
    id: "page-note",
    title: "个人学习笔记",
    icon: "📓",
    cover: "https://example.com/note-cover.jpg",
    isExpanded: true,
    parentId: null,
    tags: ["tag-note"],
  },
];

async function seed() {
  const now = new Date();

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { id: tag.id },
      create: {
        ...tag,
        createdAt: now,
        workspaceId: WORKSPACE_ID,
      },
      update: {
        name: tag.name,
        color: tag.color,
        workspaceId: WORKSPACE_ID,
      },
    });
  }

  for (const page of pages) {
    await prisma.page.upsert({
      where: { id: page.id },
      create: {
        id: page.id,
        title: page.title,
        icon: page.icon,
        cover: page.cover,
        isExpanded: page.isExpanded,
        parentId: page.parentId ?? undefined,
        tags: page.tags,
        workspaceId: WORKSPACE_ID,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        title: page.title,
        icon: page.icon,
        cover: page.cover,
        isExpanded: page.isExpanded,
        parentId: page.parentId ?? undefined,
        tags: page.tags,
        workspaceId: WORKSPACE_ID,
      },
      select: { id: true },
    });
  }
}

// Node.js 没有 import.meta.main，这里用 entrypoint 判断当前文件是否被直接执行。
const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  seed()
    .then(() => {
      console.log("Seed complete.");
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seed };
