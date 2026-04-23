---
name: email-ops-skill
description: >
  Trigger whenever the user wants to do anything with a real email account: check inbox, read messages, reply, forward, compose, send, search, archive, delete. Typical phrasing: "check my inbox", "what did X send me", "查下我邮箱". **Do not use for**: instant messaging / IM / WeChat / Slack, translating text that merely contains the word "email", or offline parsing of `.eml` files (→ just use Read).
---

# Email Operations Skill

## Tool Inventory

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `EmailQuery` | Query email accounts / messages / stats / search (mode: `list-accounts` / `list-unified` / `list-messages` / `get-message` / `search` / `unread-stats` / `list-mailboxes`) | Yes |
| `EmailMutate` | Send / reply / forward / archive / delete / move messages (send / delete / move require approval) | No |

> **Loading**: Both are deferred tools. Before calling either, activate its schema with `ToolSearch(names: "EmailQuery,EmailMutate")`.

## Which Query Mode Should I Use?

Pick based on your goal — don't guess blindly:

```
Want to know how many unread?           → unread-stats
Want a unified inbox view?              → list-unified (scope: all-inboxes)
Want sent / drafts / flagged?           → list-unified (scope: sent/drafts/flagged)
Want to browse a specific folder?       → list-messages (needs accountEmail + mailbox)
Want to search by keyword/sender?       → search (query accepts natural language)
Want to read a message in full?         → get-message (needs messageId)
Don't know which accounts are set up?   → list-accounts (always call this first to get accountEmail)
Need to know what folders exist?        → list-mailboxes
```

All list modes support `cursor` + `pageSize` (1-50) pagination.

## Core Workflows

### Workflow 1: View and Reply to a Message

```
1. list-accounts                → obtain the available accountEmail
2. list-unified (all-inboxes)   → scan inbox overview
3. get-message (messageId)      → read the full content of the message you need to reply to
4. Draft the reply
5. ⚠️ Show the draft (recipient / subject / body) in plain text and explicitly ask "send?" — wait for the user to confirm
6. send (with inReplyTo + references) → only send after the user confirms
```

**Why is step 5 mandatory?** Because once an email is sent, it can't be recalled. Wrong recipient or wrong content can lead to irreversible embarrassment or even business damage. Always let the user verify recipient, subject, and body with their own eyes before sending.

**Why must step 6 carry `inReplyTo`?** Because without it, the reply shows up as a standalone new message in the recipient's inbox, detached from the original thread. All major mail clients (Gmail, Outlook, Apple Mail) rely on the Message-ID header to thread conversations. Set `inReplyTo` to the original message's `messageId`, and set `references` to the original's references chain plus the original messageId.

### Workflow 2: Compose a New Message

```
1. list-accounts                → confirm which account to send from
2. Draft the email based on user intent
3. ⚠️ Show the complete email (recipient / subject / body) in plain text and explicitly ask "send?" — wait for the user to confirm
4. send                         → send after confirmation
```

### Workflow 3: Search and Bulk Organize

```
1. search (query: "newsletter") → find all matching messages
2. Report a summary of the results to the user
3. batch-move / batch-delete    → perform bulk operations per user instruction
```

**Handling large result sets**: Searches can return many results. Follow these principles:
- Fetch the first page with `pageSize: 20`, then report the total count and a sample to the user
- Wait for the user to confirm the scope before running bulk operations, to avoid mistakes
- Process in batches (no more than 50 per batch) and report progress between batches
- **Watch out for false positives**: Search results may include irrelevant messages (e.g. searching "newsletter" can match ordinary emails that merely mention the word). Always have the user review a sample before bulk deletion.

### Workflow 4: Daily Email Digest

```
1. unread-stats                 → quickly see unread counts per account
2. list-unified (all-inboxes, pageSize: 20) → fetch the latest message list
3. get-message on each important message → read the details
4. Produce a structured digest (grouped by urgency / sender)
```

## Forwarding Messages

There is no standalone `forward` action — forwarding is implemented via `send`:

1. `get-message` to retrieve the full original content
2. Compose a new message: set `to` to the forwarding target, prefix `subject` with `Fwd:`, and include the original content in `bodyText` (add an "---------- Forwarded message ----------" separator along with the original sender / date / subject)
3. Show the full forward in plain text and wait for the user to confirm before `send`

## Attachments

The current version **does not support sending or downloading email attachments**. If the user asks:
- Send attachment → tell them "The current version does not support sending email attachments via AI. Please do this directly in an email client such as Gmail or Outlook."
- Download attachment → same response, redirect them to their email client.

## Message Format

The `bodyText` parameter of the `send` action is **plain text only** — HTML is not supported. If the user asks for rich formatting (bold, images, tables, etc.), tell them only plain text is supported and recommend composing complex formatting in an email client.

## Common Mistakes — You Must Avoid These

1. **Sending without a plain-text confirmation step first**: This is the most serious mistake. Never send an email on your own authority — always show the full draft and wait for the user to reply "send".
2. **Replying without setting `inReplyTo`**: The thread breaks, and the recipient sees an orphan new message.
3. **Calling tools blindly without knowing `accountEmail`**: Many actions require `accountEmail`. When unsure, call `list-accounts` first.
4. **Putting passwords, keys, or credentials in the body**: Never do this.
5. **Forgetting the `Re:` prefix on replies**: Keep the subject as `Re: <original subject>` to preserve threading.
6. **Forgetting the `Fwd:` prefix on forwards**: Keep the subject as `Fwd: <original subject>`.
7. **Running bulk operations without a sample review**: Before any large-scale delete / move, show samples and wait for user confirmation to avoid wiping important mail.

## Quick Reference

**EmailQuery** 7 modes: `list-accounts` · `list-mailboxes` · `list-messages` · `list-unified` · `get-message` · `search` · `unread-stats`

**EmailMutate** 8 actions: `send` · `mark-read` · `flag` · `delete` · `move` · `batch-mark-read` · `batch-delete` · `batch-move`

Send parameters (send): requires `accountEmail`, `to`, `subject`, `bodyText`; replies additionally require `inReplyTo` and `references`. See the tool schema for full parameter details.
