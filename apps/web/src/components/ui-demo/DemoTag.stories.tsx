import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DemoTag } from './DemoTag'

const meta: Meta<typeof DemoTag> = {
  component: DemoTag,
  title: 'UI Kit/DemoTag',
  args: { children: 'TAG' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'info', 'success', 'warning', 'danger'],
    },
  },
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof DemoTag>

export const Default: Story = {}

export const Info: Story = { args: { variant: 'info' } }

export const Success: Story = { args: { variant: 'success' } }

export const Warning: Story = { args: { variant: 'warning' } }

export const Danger: Story = { args: { variant: 'danger' } }

export const LongLabel: Story = {
  args: { children: 'A VERY LONG TAG LABEL THAT MAY OVERFLOW CONTAINER' },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {(['default', 'info', 'success', 'warning', 'danger'] as const).map((v) => (
        <DemoTag key={v} variant={v}>
          {v}
        </DemoTag>
      ))}
    </div>
  ),
}
