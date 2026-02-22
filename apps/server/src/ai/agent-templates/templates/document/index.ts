import type { AgentTemplate } from '../../types'
import DOCUMENT_PROMPT from './prompt.zh.md'

export const documentTemplate: AgentTemplate = {
  id: 'document',
  name: '文档助手',
  description: '文件读写、文档分析与自动总结',
  icon: 'file-text',
  toolIds: [
    'read-file',
    'list-dir',
    'grep-files',
    'apply-patch',
    'edit-document',
    'project-query',
    'project-mutate',
  ],
  allowSubAgents: false,
  maxDepth: 1,
  isPrimary: false,
  systemPrompt: DOCUMENT_PROMPT.trim(),
}
