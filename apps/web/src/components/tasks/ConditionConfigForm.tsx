'use client'

import { memo } from 'react'
import { Input } from '@openloaf/ui/input'
import { Label } from '@openloaf/ui/label'
import { Textarea } from '@openloaf/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@openloaf/ui/tabs'

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 gap-y-2 py-2.5">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {children}
      </div>
    </div>
  )
}

const inputCls = 'h-8 w-full max-w-[260px] rounded-full border border-border/70 bg-muted/40 px-3 text-xs text-foreground shadow-none focus-visible:ring-0'

export const ConditionConfigForm = memo(function ConditionConfigForm({
  value,
  onChange,
}: ConditionConfigFormProps) {
  const updatePreFilter = (key: string, val: unknown) => {
    onChange({ ...value, preFilter: { ...value.preFilter, [key]: val } })
  }

  return (
    <div className="divide-y divide-border/60">
      <Row label="条件类型">
        <Tabs
          value={value.type}
          onValueChange={(v) => onChange({ ...value, type: v as ConditionType, preFilter: {} })}
        >
          <TabsList className="h-8 w-max rounded-full border border-border/70 bg-muted/40 p-1">
            <TabsTrigger value="email_received" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
              收到邮件
            </TabsTrigger>
            <TabsTrigger value="chat_keyword" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
              聊天关键词
            </TabsTrigger>
            <TabsTrigger value="file_changed" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
              文件变更
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
            <Tabs
              value={((value.preFilter?.matchMode as string) ?? 'any')}
              onValueChange={(v) => updatePreFilter('matchMode', v)}
            >
              <TabsList className="h-8 w-max rounded-full border border-border/70 bg-muted/40 p-1">
                <TabsTrigger value="any" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  任意匹配
                </TabsTrigger>
                <TabsTrigger value="all" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                  全部匹配
                </TabsTrigger>
              </TabsList>
            </Tabs>
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

      <div className="py-2.5">
        <Textarea
          value={value.rule ?? ''}
          onChange={(e) => onChange({ ...value, rule: e.target.value })}
          placeholder="自然语言规则（可选）— Agent 据此判断是否执行"
          rows={2}
          className="min-h-[70px] w-full border-0 bg-transparent px-0 py-0 text-sm shadow-none resize-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
        />
      </div>
    </div>
  )
})
