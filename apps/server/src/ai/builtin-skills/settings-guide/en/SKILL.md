---
name: settings-guide-skill
description: >
  Triggers when the user asks about settings, preferences, API keys, model switching, theme / language / shortcuts / proxy / backup, or related failures (key invalid, model not found) within the OpenLoaf desktop product — where to configure and how to configure them. **Not for**: code configuration files inside a project such as tsconfig / .env (→ use Read/Edit directly), general programming questions (→ answer directly), or system-level OS settings.
---

# Settings Guide (no direct tools)

## Tool Inventory

This skill has **no direct tools**. Its job is to tell the user where in the desktop UI to perform a settings action, and to explain the reasoning behind each option — essentially a built-in, searchable product manual.

## Configuration Map

What the user wants to change → where to send them:

| Need | Path |
|------|------|
| Language / theme / shortcuts | Settings → General |
| Add / edit an AI Provider | Settings → AI Models → Provider Management |
| Configure API Key | Settings → AI Models → the relevant Provider → Edit |
| Switch default model | Settings → AI Models → Model Selection |
| Add a custom model | Settings → AI Models → Custom Model (must be OpenAI API compatible) |
| Project path / Git settings | Settings → Projects |
| Temporary storage path | Settings → General → Temporary Storage Path |
| Proxy settings | Settings → General → Network Proxy |
| Data export | Settings → General → Data Management → Export |
| Backup & restore | Settings → General → Data Management → Backup |
| Storage usage view | Settings → General → Storage |

**Fallback rule**: If the user's need is not in the table above, point them to the Settings home page and tell them to use its search to locate the specific option.

## Troubleshooting Decision Tree

```
AI unresponsive / errors
├── "API key invalid" → Settings → AI Models → check the Key for the relevant Provider
├── "model not found" → Is the Provider's baseURL correct? Does the custom model ID match?
├── Can send but no reply → Check network / proxy settings, confirm the Provider endpoint is reachable
└── Garbled reply → Switch to a model that supports your target language

Email / Calendar not working
├── Not showing up → In Settings, confirm the account is enabled
└── Sync failing → Account authorization may have expired; re-authorize

Terminal not working
├── Won't open → Check that the terminal path setting is correct (Settings → General → Terminal)
├── Commands fail to execute → Verify the shell path and environment variable configuration
└── Display glitches → Try restarting the terminal session or clearing the terminal cache

Editor issues
├── Cannot save → Check file permissions and disk space
├── Syntax highlighting broken → Confirm the file type is detected correctly; try manually selecting a language mode
└── Code completion not working → Confirm the AI model is configured correctly and check network connectivity

File manager issues
├── Directory not showing → Check the project path setting (Settings → Projects)
├── File operations fail → Confirm file system permissions
└── Search returns nothing → Confirm the search scope and index status

UI issues
├── Language didn't switch → Refresh the page or restart the app (stale cache)
├── Theme not applied → Confirm it isn't set to "Follow system", which can override the choice
└── Widget fails to load → Use WidgetCheck to inspect compile errors
```

## Security Principles That Must Be Followed

- **Never display an API Key in conversation.** Why? Chat content may be logged or exposed via screen sharing. Direct the user to view or modify it in the Settings UI.
- **Recommend a restart after Provider changes.** Why? The model connection pool is initialized at startup; swapping Providers at runtime may not take effect immediately.
- **Model switching is global.** Switching the default model affects every new conversation; advise the user to try it out in a new conversation first.

## Privacy Notes (share when asked)

- All data is stored locally (SQLite); nothing is uploaded to the cloud
- API Keys are stored encrypted in the local database
- Network access only occurs when calling AI APIs and syncing email / calendar

## Common Anti-patterns

| Bad answer | Good answer |
|------------|-------------|
| "Go take a look in Settings" | "Settings → AI Models → Provider Management → click the Provider → Edit API Key" |
| "You can tweak it in Settings" | "Settings → General → Network Proxy, enter your proxy address (e.g. http://127.0.0.1:7890)" |
| "It should be somewhere in there" | "Settings → General → Theme, pick 'Dark' to switch to dark mode" |

## Answering Strategy

1. First nail down what the user wants to change → look it up in the Configuration Map above
2. Give the exact path — never say "go find it in Settings"
3. If it's troubleshooting → walk the decision tree, narrowing down step by step
4. Anything involving an API Key → only say "please do it in the Settings UI"; never ask the user to paste a Key
