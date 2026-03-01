import { getActiveWorkspaceConfig, getWorkspaceByIdConfig } from '@openloaf/api/services/workspaceConfig'
import { getWorkspaceProjectEntries } from '@openloaf/api/services/workspaceProjectConfig'
import { readWorkspaceProjectTrees } from '@openloaf/api/services/projectTreeService'

async function main() {
  console.log('Active workspace:', JSON.stringify(getActiveWorkspaceConfig()))
  const ws = getWorkspaceByIdConfig('00000000-e2e0-4000-8000-000000000001')
  console.log('E2E workspace by ID:', JSON.stringify(ws))
  console.log('Project entries:', JSON.stringify(getWorkspaceProjectEntries()))
  const trees = await readWorkspaceProjectTrees()
  console.log('Project trees:', JSON.stringify(trees, null, 2))
}

main().catch(console.error)
