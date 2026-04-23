import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { GroupGrid } from "./makeGroupStories"

const meta: Meta<typeof GroupGrid> = {
  title: "Tool UI/Skill · macOS 桌面控制",
  component: GroupGrid,
  parameters: { layout: "padded" },
}
export default meta
type Story = StoryObj<typeof GroupGrid>
export const All: Story = { args: { groupKey: "skill-macos-control" } }
