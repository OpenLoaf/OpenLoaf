// 定义PageTreeNode类型
export interface PageTreeNode {
  id: string;
  title: string | null;
  icon: string | null;
  cover: string | null;
  isExpanded: boolean;
  createdAt: Date;
  updatedAt: Date;
  parentId: string | null;
  children: PageTreeNode[];
  resources: any[];
  workspaceId: string;
}

/** Build page tree structure. */
function buildTree(pages: any[]): PageTreeNode[] {
  const pageMap = new Map<string, PageTreeNode>();
  const rootPages: PageTreeNode[] = [];

  // 首先将所有页面转换为PageTreeNode并存储在map中
  for (const page of pages) {
    const treeNode: PageTreeNode = {
      ...page,
      children: [],
    };
    pageMap.set(page.id, treeNode);
  }

  // 然后构建树结构
  for (const page of pages) {
    const treeNode = pageMap.get(page.id)!;
    if (page.parentId) {
      const parent = pageMap.get(page.parentId);
      if (parent) {
        parent.children.push(treeNode);
      }
    } else {
      rootPages.push(treeNode);
    }
  }

  return rootPages;
}

/** Get project list as tree nodes. */
export async function getProjectList(workspaceId: string, prisma: any): Promise<PageTreeNode[]> {
  const pages = await prisma.page.findMany({
    where: { workspaceId },
    include: {
      resources: true,
    },
  });

  return buildTree(pages);
}
