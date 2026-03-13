## ADDED Requirements

### Requirement: Task-based Agent Delegation

Secretary（Master Agent）SHALL be able to create a Task to delegate work to a specialized Agent. A Task SHALL:
- Be associated with a project (optional) and an agent type
- Have an independent execution space (`~/.openloaf/tasks/{taskId}/`)
- Track lifecycle status: pending → running → completed/failed
- Store agent work messages in `tasks/{taskId}/messages.jsonl`
- Support sub-agent spawning within the task (stored in `tasks/{taskId}/agents/{subId}/`)

#### Scenario: Secretary creates a task for code review

- **WHEN** user asks "帮我审查 src/utils 的代码质量"
- **THEN** Secretary creates a Task with agentType "code-reviewer"
- **AND** Task status is set to "running"
- **AND** Secretary responds with a task-ref part indicating the task was created

#### Scenario: Task agent executes independently

- **WHEN** a Task is created with status "running"
- **THEN** the assigned Agent executes in `~/.openloaf/tasks/{taskId}/`
- **AND** agent work messages are persisted to `messages.jsonl`
- **AND** the agent MAY spawn sub-agents stored in `agents/{subId}/`

### Requirement: Task Completion Reporting

When a Task Agent completes, it SHALL report back to the originating ChatSession.

#### Scenario: Agent reports completion to chat

- **WHEN** Task Agent finishes execution
- **THEN** a `task-report` message is appended to the source ChatSession's `messages.jsonl`
- **AND** the message contains the agent's summary, displayName, and task status
- **AND** the front-end receives a tRPC subscription notification
- **AND** Task status in SQLite is updated to "completed"

#### Scenario: Agent reports failure

- **WHEN** Task Agent encounters an unrecoverable error
- **THEN** a `task-report` message with error details is appended to the source ChatSession
- **AND** Task status is updated to "failed"

### Requirement: @mention Agent Routing

Users SHALL be able to @mention a Task's Agent to send follow-up messages directly to it.

#### Scenario: User @mentions a working agent

- **WHEN** user sends a message containing @mention of an active Task Agent
- **THEN** the message is routed to that Task Agent (appended to its input queue)
- **AND** the Agent processes the follow-up and responds in the ChatSession

#### Scenario: User sends message without @mention

- **WHEN** user sends a message without any @mention
- **THEN** the message is routed to Secretary (existing behavior)

### Requirement: Sub-Agent vs Task Boundary

Secretary SHALL determine whether to use an internal sub-agent or create a Task based on the nature of the request.

#### Scenario: Quick question uses sub-agent

- **WHEN** user asks a question that can be answered immediately (e.g., "这个函数是干嘛的？")
- **THEN** Secretary uses existing sub-agent mechanism (invisible to user)
- **AND** no Task is created

#### Scenario: Long-running work creates task

- **WHEN** user delegates a substantial piece of work (e.g., "帮我重构这个模块")
- **THEN** Secretary creates a Task with appropriate agent type
- **AND** user can continue chatting with Secretary while Task executes in background

### Requirement: Task Data Model

The system SHALL store Task metadata in SQLite with the following fields:
- id, projectId (optional), sessionId (source chat), agentType, title, description
- status (pending/running/completed/failed), result (summary)
- createdAt, startedAt, completedAt

#### Scenario: Task persisted to database

- **WHEN** Secretary creates a new Task
- **THEN** a Task record is inserted into SQLite
- **AND** a `tasks/{taskId}/task.json` file is created with agent configuration

### Requirement: Chat Message Extensions

The chat message format SHALL be extended to support task-related content.

#### Scenario: Task reference in assistant message

- **WHEN** Secretary creates a Task
- **THEN** the assistant message includes a `task-ref` part with taskId, title, agentType, and status

#### Scenario: Task report as new message role

- **WHEN** a Task Agent reports completion
- **THEN** a message with `role: "task-report"` is appended to the chat timeline
- **AND** the message includes metadata with taskId, agentType, and displayName
