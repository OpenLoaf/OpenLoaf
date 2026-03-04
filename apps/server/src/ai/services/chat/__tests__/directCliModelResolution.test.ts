/**
 * Test: directCli mode should use chatModelId from request
 */
import { describe, it, expect } from 'vitest';
import { resolveCliChatModelId } from '../../../models/cli/cliProviderEntry.js';

describe('directCli model resolution', () => {
  it('should resolve codex-cli:gpt-5.3-codex correctly', async () => {
    const result = await resolveCliChatModelId('codex-cli:gpt-5.3-codex');
    console.log('Resolved model ID:', result);
    expect(result).toBe('codex-cli:gpt-5.3-codex');
  });

  it('should resolve codex-cli provider to first available model', async () => {
    const result = await resolveCliChatModelId('codex-cli');
    console.log('Resolved provider to model:', result);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^codex-cli:/);
  });

  it('should handle legacy codex selection', async () => {
    const result = await resolveCliChatModelId('codex');
    console.log('Resolved legacy codex:', result);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^codex-cli:/);
  });
});
