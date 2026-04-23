import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import MessageTool from '@/components/ai/message/tools/MessageTool'
import { ChatProvidersDecorator } from './decorators'
import { TOOL_FIXTURE_GROUPS, type ToolFixture, type ToolFixtureGroup } from './fixtures'

export function GroupGrid({ groupKey, only }: { groupKey: string; only?: string[] }) {
  const group = TOOL_FIXTURE_GROUPS.find((g) => g.key === groupKey) as ToolFixtureGroup | undefined
  if (!group) return <div>Unknown group: {groupKey}</div>
  const fixtures = only?.length ? group.fixtures.filter((f) => only.includes(f.id)) : group.fixtures
  return (
    <ChatProvidersDecorator parts={fixtures.map((f) => f.part)}>
      <div>
        <div className="mb-4 border-b border-border/60 pb-2">
          <h2 className="text-lg font-semibold">{group.label}</h2>
          {group.description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {fixtures.map((fx) => (
            <section key={fx.id} data-testid={`tool-fixture-${fx.id}`} className="space-y-1.5">
              <header className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono text-foreground/70">{fx.toolKind}</span>
                <span>·</span>
                <span>{fx.title}</span>
                <span className="ml-auto font-mono text-[10px] opacity-60">{fx.part.state ?? 'n/a'}</span>
                {fx.providerExecuted ? (
                  <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">providerExecuted</span>
                ) : null}
              </header>
              <MessageTool part={fx.part} messageId={`gallery-${fx.id}`} />
            </section>
          ))}
        </div>
      </div>
    </ChatProvidersDecorator>
  )
}

export function SingleFixture({ fixture }: { fixture: ToolFixture }) {
  return (
    <ChatProvidersDecorator parts={[fixture.part]}>
      <div data-testid={`tool-fixture-${fixture.id}`} className="max-w-3xl space-y-2">
        <header className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground/70">{fixture.toolKind}</span>
          <span>·</span>
          <span>{fixture.title}</span>
          <span className="ml-auto font-mono text-[10px] opacity-60">{fixture.part.state ?? 'n/a'}</span>
        </header>
        <MessageTool part={fixture.part} messageId={`gallery-${fixture.id}`} />
      </div>
    </ChatProvidersDecorator>
  )
}

export type GroupStoryMeta = Meta<typeof GroupGrid>
export type GroupStoryObj = StoryObj<typeof GroupGrid>
