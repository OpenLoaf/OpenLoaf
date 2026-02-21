'use client'

import { memo } from 'react'
import { Input } from '@tenas-ai/ui/input'
import { Label } from '@tenas-ai/ui/label'
import { Textarea } from '@tenas-ai/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tenas-ai/ui/select'

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
    <div className={`flex items-center justify-between gap-3 py-2 ${last ? '' : 'border-b border-border/30'}`}>
      <Label className="shrink-0 text-[13px] font-normal text-muted-foreground">{label}</Label>
      <div className="flex-1 [&_input]:text-right [&_input]:text-[13px]">{children}</div>
    </div>
  )
}

const inputCls = 'border-0 bg-transparent shadow-none h-7 px-0 text-[13px]'

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
        <Select
          value={value.type}
          onValueChange={(v) => onChange({ ...value, type: v as ConditionType, preFilter: {} })}
        >
          <SelectTrigger className="border-0 bg-transparent shadow-none h-7 text-[13px] justify-end gap-1 px-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="email_received" className="rounded-lg text-xs">收到邮件</SelectItem>
            <SelectItem value="chat_keyword" className="rounded-lg text-xs">聊天关键词</SelectItem>
            <SelectItem value="file_changed" className="rounded-lg text-xs">文件变更</SelectItem>
          </SelectContent>
        </Select>
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
            <Select
              value={(value.preFilter?.matchMode as string) ?? 'any'}
              onValueChange={(v) => updatePreFilter('matchMode', v)}
            >
              <SelectTrigger className="border-0 bg-transparent shadow-none h-7 text-[13px] justify-end gap-1 px-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="any" className="rounded-lg text-xs">任意匹配</SelectItem>
                <SelectItem value="all" className="rounded-lg text-xs">全部匹配</SelectItem>
              </SelectContent>
            </Select>
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
          className="border-0 bg-secondary/40 rounded-lg shadow-none resize-none text-[13px]"
        />
      </div>
    </div>
  )
})
