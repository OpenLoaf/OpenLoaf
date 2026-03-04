/**
 * Test script to verify Codex model resolution
 * Run: node apps/server/test-codex-resolution.mjs
 */

console.log('=== Testing Codex Model Resolution ===\n');

// Simulate the backend logic
const testCases = [
  {
    name: 'Request with explicit chatModelId',
    request: {
      chatModelId: 'codex-cli:gpt-5.3-codex',
    },
    metadata: {
      directCli: true,
      codexOptions: { mode: 'chat', reasoningEffort: 'medium' }
    },
    agentModelIds: {
      codeModelIds: ['codex-cli:gpt-5.2-codex']
    }
  },
  {
    name: 'Request without chatModelId (fallback to agent config)',
    request: {},
    metadata: {
      directCli: true,
      codexOptions: { mode: 'chat', reasoningEffort: 'medium' }
    },
    agentModelIds: {
      codeModelIds: ['codex-cli:gpt-5.3-codex']
    }
  },
  {
    name: 'Request with chatModelId but no directCli',
    request: {
      chatModelId: 'codex-cli:gpt-5.3-codex',
    },
    metadata: {
      directCli: false,
    },
    agentModelIds: {
      codeModelIds: []
    }
  }
];

// Simulate the backend logic from chatStreamService.ts
function simulateBackendLogic(testCase) {
  const { request, metadata, agentModelIds } = testCase;

  let chatModelId = 'default-model'; // Initial value
  const directCli = metadata.directCli;

  console.log(`Test: ${testCase.name}`);
  console.log(`  directCli: ${directCli}`);
  console.log(`  request.chatModelId: ${request.chatModelId || 'undefined'}`);
  console.log(`  agentModelIds.codeModelIds: ${JSON.stringify(agentModelIds.codeModelIds)}`);

  if (directCli) {
    // 优先使用前端明确传递的 chatModelId
    const explicitChatModelId = request.chatModelId?.trim();
    if (explicitChatModelId) {
      chatModelId = explicitChatModelId;
      console.log(`  ✅ Using explicit chatModelId: ${chatModelId}`);
    } else {
      // 回退：从 master agent 的 codeModelIds 配置解析
      const cliSelection = agentModelIds.codeModelIds?.[0]?.trim();
      if (cliSelection) {
        chatModelId = cliSelection; // Simplified - in real code this calls resolveCliChatModelId
        console.log(`  ⚠️  Fallback to agent config: ${chatModelId}`);
      } else {
        console.log(`  ❌ No model found, using default`);
      }
    }
  } else {
    console.log(`  ℹ️  Not directCli mode, using default model`);
  }

  console.log(`  Final chatModelId: ${chatModelId}\n`);
  return chatModelId;
}

// Run tests
testCases.forEach(testCase => {
  simulateBackendLogic(testCase);
});

console.log('=== Expected Behavior ===');
console.log('Test 1: Should use "codex-cli:gpt-5.3-codex" from request');
console.log('Test 2: Should fallback to "codex-cli:gpt-5.3-codex" from agent config');
console.log('Test 3: Should use default model (not directCli mode)');
