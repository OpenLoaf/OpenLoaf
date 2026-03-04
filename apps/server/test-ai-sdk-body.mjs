/**
 * Test: Verify how AI SDK handles body parameter
 */

console.log('=== AI SDK sendMessage Body Handling ===\n');

// Simulate what happens when we call sendMessage({ parts, metadata, body: { chatModelId } })
const messageInput = {
  parts: [{ type: 'text', text: 'Hello' }],
  metadata: { directCli: true },
  body: { chatModelId: 'codex-cli:gpt-5.3-codex' }
};

console.log('Input to sendMessage:');
console.log(JSON.stringify(messageInput, null, 2));

console.log('\n=== Problem ===');
console.log('AI SDK treats "body" as a message property, not as transport body parameter');
console.log('Result: chatModelId ends up in messages[0].body, not at request top level');

console.log('\n=== Solution ===');
console.log('Option 1: Use experimental_prepareRequestBody in useChat config');
console.log('Option 2: Pass chatModelId through ChatCoreProvider params');
console.log('Option 3: Modify transport to extract chatModelId from message.body');

console.log('\n=== Recommended: Option 3 ===');
console.log('In transport.ts, extract chatModelId from lastMessage.body before sending');
