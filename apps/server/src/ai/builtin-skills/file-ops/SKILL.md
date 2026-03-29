---
name: file-ops
description: 文件读写、目录浏览、内容搜索、文档编辑——当用户在项目文件页面操作，或提及任何文件相关意图（读取、编辑、创建、删除、搜索、浏览目录、查看代码/脚本/配置/日志/数据文件、对比文件、重命名、移动文件、查看文件大小/类型/分辨率）时，必须加载此 skill。
---

# 文件操作决策指南

## 工具选择决策树

面对文件操作请求，按以下顺序判断：

### 我需要找到某个东西

```
知道文件名/路径？
  ├─ 是 → read-file 直接读取
  └─ 否 → 知道文件内容特征（函数名、变量、错误信息）？
       ├─ 是 → grep-files 搜索内容，拿到路径后 read-file
       └─ 否 → list-dir 浏览目录结构，找到目标后 read-file
```

### 我需要修改文件

```
目标是 tndoc_ 文稿（MDX 富文本）？
  ├─ 是 → edit-document（整体覆写 MDX 内容）
  └─ 否 → apply-patch（所有普通文件的增删改都用它）
       ├─ 修改已有文件 → *** Update File
       ├─ 创建新文件   → *** Add File
       ├─ 删除文件     → *** Delete File
       └─ 重命名/移动  → *** Update File + *** Move to
```

### 我只需要元信息

```
要看目录里有什么？ → list-dir
要看文件大小/类型/分辨率？ → file-info
```

## 核心工作流

### 修改已有文件（最常见）

1. **read-file** — 先读取当前内容。这不是可选步骤：apply-patch 的上下文行必须与文件实际内容逐字符匹配，凭记忆写 patch 是失败的首要原因。
2. **apply-patch** — 用最小 diff 修改。只包含变更行及其前后上下文，不要重写整个文件。
3. 如果修改结果不确定 → **read-file** 验证。

### 探索陌生项目

1. **list-dir**（depth: 2, format: "tree"）— 了解顶层结构
2. **grep-files** — 用关键词定位核心文件（如搜索 `main|entry|index` 找入口）
3. **read-file** — 深入阅读关键文件

### 批量修改多个文件

apply-patch 支持一次调用修改多个文件，合并到同一个 patch 中。这比分多次调用更高效，也能保证原子性。

## `apply-patch` vs `edit-document` 关键区别

- **apply-patch**：差量编辑，适用于所有普通文件（.ts, .py, .json, .yaml, .md, ...）。通过上下文行精确定位修改位置。也用于创建和删除文件。
- **edit-document**：全量覆写，仅用于 `tndoc_` 文稿目录下的 `index.mdx`。因为 MDX 富文本结构复杂，差量编辑容易破坏格式，所以采用整体写入。

判断标准很简单：**路径中包含 `tndoc_` → edit-document，其他一切 → apply-patch**。

## `grep-files` vs `list-dir` 选择

- **grep-files**：搜索文件**内容**。你知道文件里有什么（函数名、类名、错误文本、TODO 标记），但不知道在哪个文件。返回匹配文件路径列表。
- **list-dir**：浏览目录**结构**。你想看某个目录下有哪些文件和子目录。支持 glob 过滤文件名（如 `*.ts`），但不看内容。

典型组合：先 `list-dir` 确认目录存在且结构合理，再 `grep-files` 在该目录下搜索特定代码。

## 大文件处理策略

read-file 默认读取前 2000 行。对于大文件，盲目全量读取会浪费上下文窗口——你读入了 2000 行但可能只关心其中 20 行，而且超出限制的部分会被静默截断，导致你看到不完整的内容却以为看到了全部。

**正确做法**：
- 先用 `grep-files` 定位目标在哪一行附近的文件
- 再用 `read-file` 的 offset/limit 只读取需要的片段（如 offset: 150, limit: 50 读第 150-199 行）
- 或用 indentation 模式：指定 anchorLine + maxLevels，自动展开该行所属的代码块及其父级结构，非常适合快速理解一个函数而不读整个文件

## 常见错误及避免方法

1. **apply-patch 上下文不匹配** — 最常见的失败原因。patch 中的上下文行（空格开头的行）必须与文件当前内容完全一致，包括空格、缩进、标点。解决：修改前始终先 read-file。

2. **对二进制文件使用 read-file** — 图片、PDF、Office 文档、压缩包等二进制文件不能用 read-file 读取（会报错）。应该用 file-info 查看元数据，或通过 tool-search 加载专用工具（excel-query、pdf-query、word-query、pptx-query）。

3. **apply-patch 的 @@ 行不够精确** — 当文件中有多处相似代码时，3 行上下文可能不足以唯一定位。此时在 @@ 后加上函数名或类名作为定位提示（如 `@@ export function handleSubmit`），或增加更多上下文行。

4. **list-dir 结果太多** — 默认深度为 2、每页 25 条。大型项目应先用小深度概览，再对感兴趣的子目录深入 list-dir。用 pattern 参数过滤（如 `*.ts`）可大幅减少噪声。

5. **忘记 edit-document 是全量覆写** — 使用 edit-document 时必须提供完整的 MDX 内容，不是差量。修改前先 read-file 获取完整内容，在此基础上修改后整体写入。
