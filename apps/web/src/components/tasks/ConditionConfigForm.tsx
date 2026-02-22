'use client'

import { memo } from 'react'
import { Input } from '@tenas-ai/ui/input'
import { Label } from '@tenas-ai/ui/label'
import { Textarea } from '@tenas-ai/ui/textarea'
import { FilterTab } from '@tenas-ai/ui/filter-tab'

type ConditionType = 'email_received' | 'chat_keyword' | 'file_changed'

type ConditionValue = {
  type: ConditionType
  preFilter?: Record<string, unknown>
  rule?: string
}

type ConditionConfigFormProps = {
  value: ConditionValue
  onChange: (value: ConditionValue) => void
}

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`grid grid-cols-[110px_1fr] gap-3 py-2 ${last ? '' : 'border-b border-border/30'}`}>
      <Label className="text-[12px] font-medium text-muted-foreground">{label}</Label>
      <div className="flex justify-end">{children}</div>
    </div>
  )
}

const inputCls = 'h-9 w-full max-w-[260px] rounded-md border border-border/60 bg-background px-3 text-[13px] shadow-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0'

export const ConditionConfigForm = memo(function ConditionConfigForm({
  value,
  onChange,
}: ConditionConfigFormProps) {
  const updatePreFilter = (key: string, val: unknown) => {
    onChange({ ...value, preFilter: { ...value.preFilter, [key]: val } })
  }

  return (
    <div className="flex flex-col gap-0">
      <Row label="条件类型">
        <div className="flex w-fit rounded-lg border border-border/50 bg-muted p-1">
          <FilterTab
            text="收到邮件"
            selected={value.type === 'email_received'}
            onSelect={() => onChange({ ...value, type: 'email_received', preFilter: {} })}
            layoutId="condition-type-tab"
          />
          <FilterTab
            text="聊天关键词"
            selected={value.type === 'chat_keyword'}
            onSelect={() => onChange({ ...value, type: 'chat_keyword', preFilter: {} })}
            layoutId="condition-type-tab"
          />
          <FilterTab
            text="文件变更"
            selected={value.type === 'file_changed'}
            onSelect={() => onChange({ ...value, type: 'file_changed', preFilter: {} })}
            layoutId="condition-type-tab"
          />
        </div>
      </Row>

      {value.type === 'email_received' ? (
        <>
          <Row label="发件人">
            <Input
              value={(value.preFilter?.from as string) ?? ''}
              onChange={(e) => updatePreFilter('from', e.target.value)}
              placeholder="如 bank.com"
              className={inputCls}
            />
          </Row>
          <Row label="主题">
            <Input
              value={(value.preFilter?.subject as string) ?? ''}
              onChange={(e) => updatePreFilter('subject', e.target.value)}
              placeholder="如 账单"
              className={inputCls}
            />
          </Row>
          <Row label="正文">
            <Input
              value={(value.preFilter?.body as string) ?? ''}
              onChange={(e) => updatePreFilter('body', e.target.value)}
              placeholder="可选"
              className={inputCls}
            />
          </Row>
        </>
      ) : null}

      {value.type === 'chat_keyword' ? (
        <>
          <Row label="关键词">
            <Input
              value={((value.preFilter?.keywords as string[]) ?? []).join(', ')}
              onChange={(e) =>
                updatePreFilter('keywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
              }
              placeholder="逗号分隔"
              className={inputCls}
            />
          </Row>
          <Row label="匹配模式">
            <div className="flex w-fit rounded-lg border border-border/50 bg-muted p-1">
              <FilterTab
                text="任意匹配"
                selected={((value.preFilter?.matchMode as string) ?? 'any') === 'any'}
                onSelect={() => updatePreFilter('matchMode', 'any')}
                layoutId="match-mode-tab"
              />
              <FilterTab
                text="全部匹配"
                selected={((value.preFilter?.matchMode as string) ?? 'any') === 'all'}
                onSelect={() => updatePreFilter('matchMode', 'all')}
                layoutId="match-mode-tab"
              />
            </div>
          </Row>
        </>
      ) : null}

      {value.type === 'file_changed' ? (
        <>
          <Row label="监听路径">
            <Input
              value={((value.preFilter?.watchPaths as string[]) ?? []).join(', ')}
              onChange={(e) =>
                updatePreFilter('watchPaths', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
              }
              placeholder="如 src/, docs/"
              className={inputCls}
            />
          </Row>
          <Row label="扩展名">
            <Input
              value={((value.preFilter?.extensions as string[]) ?? []).join(', ')}
              onChange={(e) =>
                updatePreFilter('extensions', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
              }
              placeholder="如 .ts, .tsx"
              className={inputCls}
            />
          </Row>
        </>
      ) : null}

      <div className="pt-2">
        <Textarea
          value={value.rule ?? ''}
          onChange={(e) => onChange({ ...value, rule: e.target.value })}
          placeholder="自然语言规则（可选）— Agent 据此判断是否执行"
          rows={2}
          className="min-h-[70px] rounded-md border border-border/60 bg-background px-3 py-2 text-[13px] shadow-none resize-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0"
        />
      </div>
    </div>
  )
})
