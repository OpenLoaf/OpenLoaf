/**
 * Test: Simulate request parsing to verify chatModelId extraction
 */

// Simulate the actual request body from the user
const actualRequest = {
  "projectId": "proj_b2acdf63-bd28-40d2-b2c1-1309ebb54b83",
  "workspaceId": "a3c27df8-442d-4beb-b752-865253106e3e",
  "sessionId": "chat_20260304_214952_to6i5gyd",
  "clientId": "f1779da0-04f1-4cec-8dc0-dc5740f23048",
  "timezone": "Asia/Shanghai",
  "tabId": "tab_2070d5d0-bd5a-495d-b560-d9954b9bea9d",
  "intent": "chat",
  "responseMode": "stream",
  "messages": [{
    "role": "user",
    "parts": [{"type": "text", "text": "当前是什么项目"}],
    "metadata": {
      "codexOptions": {"mode": "chat", "reasoningEffort": "medium"},
      "webSearch": {"enabled": false},
      "directCli": true
    },
    "body": {"chatModelId": "codex-cli:gpt-5.3-codex"},
    "id": "8rZ1IoWdumMqerP0",
    "parentMessageId": null
  }]
};

console.log('=== Analyzing Request Structure ===\n');
console.log('Top-level chatModelId:', actualRequest.chatModelId);
console.log('Message-level body.chatModelId:', actualRequest.messages[0].body?.chatModelId);
console.log('\n=== Problem Identified ===');
console.log('The chatModelId is in messages[0].body, not at the top level!');
console.log('Backend expects: request.chatModelId');
console.log('Frontend sends: messages[0].body.chatModelId');
console.log('\n=== Solution ===');
console.log('The chatModelId should be at the top level of the request, not inside the message body.');
