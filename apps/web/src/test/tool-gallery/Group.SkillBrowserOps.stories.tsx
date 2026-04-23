import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { GroupGrid } from "./makeGroupStories"

const meta: Meta<typeof GroupGrid> = {
  title: "Tool UI/Skill · 浏览器操作",
  component: GroupGrid,
  parameters: { layout: "padded" },
}
export default meta
type Story = StoryObj<typeof GroupGrid>
export const All: Story = { args: { groupKey: "skill-browser-ops" } }
