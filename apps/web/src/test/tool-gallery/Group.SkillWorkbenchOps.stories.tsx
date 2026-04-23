import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { GroupGrid } from "./makeGroupStories"

const meta: Meta<typeof GroupGrid> = {
  title: "Tool UI/Skill · 工作台 Widget",
  component: GroupGrid,
  parameters: { layout: "padded" },
}
export default meta
type Story = StoryObj<typeof GroupGrid>
export const All: Story = { args: { groupKey: "skill-workbench-ops" } }
