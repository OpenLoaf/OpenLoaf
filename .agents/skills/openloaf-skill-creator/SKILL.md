---
name: openloaf-skill-creator
description: >
  Create new skills, modify and improve existing skills for OpenLoaf AI platform.
  Use when users want to create a skill, edit or optimize an existing skill,
  run tests to evaluate a skill, or when someone says "create a skill",
  "帮我创建一个技能", "新建 skill", "add a skill", "make a new skill",
  "创建技能", "写一个 skill", "我想添加新能力".
  Even if "skill" isn't mentioned, use this whenever the user wants to extend
  what OpenLoaf AI can do or teach the AI new workflows.
---

# OpenLoaf Skill Creator

A skill for creating new OpenLoaf Skills and iteratively improving them.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few test prompts and run them with the skill loaded
- Help the user evaluate the results both qualitatively and quantitatively
- Rewrite the skill based on feedback from the user's evaluation
- Repeat until you're satisfied
- Expand the test set and try again at larger scale

Your job when using this skill is to figure out where the user is in this process and then jump in and help them progress through these stages. So for instance, maybe they're like "I want to make a skill for X". You can help narrow down what they mean, write a draft, write the test cases, figure out how they want to evaluate, run all the prompts, and repeat.

On the other hand, maybe they already have a draft of the skill. In this case you can go straight to the eval/iterate part of the loop.

Of course, you should always be flexible and if the user is like "I don't need to run a bunch of evaluations, just vibe with me", you can do that instead.

Then after the skill is done, you can also run the description improver to optimize the triggering of the skill.

Cool? Cool.

## Communicating with the user

The skill creator is liable to be used by people across a wide range of familiarity with coding jargon. Pay attention to context cues to understand how to phrase your communication! In the default case:

- "evaluation" and "benchmark" are borderline, but OK
- for "JSON" and "assertion" you want to see serious cues from the user that they know what those things are before using them without explaining them

It's OK to briefly explain terms if you're in doubt, and feel free to clarify terms with a short definition if you're unsure if the user will get it.

---

## Creating a skill

### Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., they say "turn this into a skill"). If so, extract answers from the conversation history first — the tools used, the sequence of steps, corrections the user made, input/output formats observed. The user may need to fill the gaps, and should confirm before proceeding to the next step.

1. What should this skill enable the AI to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases to verify the skill works? Skills with objectively verifiable outputs (file transforms, data extraction, code generation, fixed workflow steps) benefit from test cases. Skills with subjective outputs (writing style, art) often don't need them. Suggest the appropriate default based on the skill type, but let the user decide.

### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies. Wait to write test prompts until you've got this part ironed out.

Check available MCPs — if useful for research (searching docs, finding similar skills, looking up best practices), research in parallel via subagents if available, otherwise inline. Come prepared with context to reduce burden on the user.

---

## Skill 作用域

OpenLoaf Skill 有三层优先级（低 → 高）：

```
~/.agents/skills/                      ← 全局（所有项目可见）
{parent-project}/.agents/skills/       ← 父项目（子项目继承）
.agents/skills/                        ← 当前项目（最高优先级）
```

同名 skill 后层覆盖前层（不合并）。

**选择原则**：
- 项目特有知识（API、业务逻辑）→ `.agents/skills/`（最常用）
- 多个子项目共用 → 父项目 `.agents/skills/`
- 通用能力（设计规范、写作风格）→ `~/.agents/skills/`

---

### Write the SKILL.md

Based on the user interview, fill in these components:

- **name**: Skill identifier (kebab-case, lowercase)
- **description**: When to trigger, what it does. This is the primary triggering mechanism — include both what the skill does AND specific contexts for when to use it. All "when to use" info goes here, not in the body. Note: AI has a tendency to "undertrigger" skills — to not use them when they'd be useful. To combat this, please make the skill descriptions a little bit "pushy". So for instance, instead of "How to build a simple fast dashboard to display internal data.", you might write "How to build a simple fast dashboard to display internal data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**: Required tools, dependencies (optional, rarely needed)
- **the rest of the skill :)**

### Skill Writing Guide

#### Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
├── openloaf.json (required for OpenLoaf)
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, icons, fonts)
```

#### Progressive Disclosure

Skills use a three-level loading system:
1. **Metadata** (name + description) — Always in context (~100 words)
2. **SKILL.md body** — In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** — As needed (unlimited, scripts can execute without loading)

**Key patterns:**
- Keep SKILL.md under 500 lines; if you're approaching this limit, add an additional layer of hierarchy with clear pointers about where to go next.
- Reference files clearly from SKILL.md with guidance on when to read them
- For large reference files (>300 lines), include a table of contents

**Domain organization**: When a skill supports multiple domains/frameworks, organize by variant:
```
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

#### Principle of Lack of Surprise

Skills must not contain malware, exploit code, or any content that could compromise system security. A skill's contents should not surprise the user in their intent if described. Don't go along with requests to create misleading skills or skills designed to facilitate unauthorized access, data exfiltration, or other malicious activities.

#### Writing Patterns

Prefer using the imperative form in instructions.

**Writing Style**: Try to explain to the model *why* things are important in lieu of heavy-handed MUSTs. Use theory of mind and try to make the skill general and not super-narrow to specific examples. Start by writing a draft and then look at it with fresh eyes and improve it.

---

## Write openloaf.json

每个 skill 文件夹**必须**包含 openloaf.json，用于 OpenLoaf UI 显示：

```json
{
  "name": "技能中文名",
  "description": "中文描述（一句话）",
  "icon": "🔧",
  "version": "0.1.0",
  "sourceLanguage": "zh-CN",
  "targetLanguage": "zh-CN",
  "translatedAt": "当前 ISO 时间戳",
  "colorIndex": 0
}
```

**colorIndex 颜色**：0=青色 1=紫色 2=琥珀 3=天蓝 4=玫瑰 5=祖母绿 6=靛蓝 7=酸橙

---

### Test Cases

After writing the skill draft, come up with 2-3 realistic test prompts — the kind of thing a real user would actually say. Share them with the user: "Here are a few test cases I'd like to try. Do these look right, or do you want to add more?" Then run them.

Save test cases to `evals/evals.json`. Don't write assertions yet — just the prompts. You'll draft assertions in the next step while the runs are in progress.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

See `references/schemas.md` for the full schema (including the `assertions` field, which you'll add later).

---

## Running and evaluating test cases

Put results in `<skill-name>-workspace/` as a sibling to the skill directory. Within the workspace, organize results by iteration (`iteration-1/`, `iteration-2/`, etc.) and within that, each test case gets a directory (`eval-0/`, `eval-1/`, etc.).

### Step 1: Spawn all runs in the same turn

For each test case, spawn two subagents in the same turn — one with the skill, one without. This is important: don't spawn the with-skill runs first and then come back for baselines later. Launch everything at once so it all finishes around the same time.

**With-skill run:**

```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about>
```

**Baseline run** (same prompt, but the baseline depends on context):
- **Creating a new skill**: no skill at all. Same prompt, no skill path, save to `without_skill/outputs/`.
  - "Without skill" here means: run in OpenLoaf AI conversation without the skill loaded.
- **Improving an existing skill**: the old version. Snapshot the skill before editing, point the baseline at the snapshot. Save to `old_skill/outputs/`.

Write an `eval_metadata.json` for each test case (assertions can be empty for now). Give each eval a descriptive name based on what it's testing.

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

### Step 2: While runs are in progress, draft assertions

Don't just wait for the runs to finish — draft quantitative assertions for each test case and explain them to the user. If assertions already exist in `evals/evals.json`, review them and explain what they check.

Good assertions are objectively verifiable and have descriptive names. Subjective skills (writing style, design quality) are better evaluated qualitatively.

### Step 3: As runs complete, capture timing data

When each subagent task completes, save timing data to `timing.json` in the run directory:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

### Step 4: Grade, aggregate, and present results

Once all runs are done:

1. **Grade each run** — spawn a grader subagent (read `agents/grader.md`) that evaluates each assertion against the outputs. Save results to `grading.json` in each run directory.

2. **Aggregate into benchmark** — run the aggregation script:
   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```
   This produces `benchmark.json` and `benchmark.md`.

3. **Do an analyst pass** — read the benchmark data and surface patterns. See `agents/analyzer.md` for what to look for.

4. **Present results in conversation** — since there's no browser reviewer, show results directly:
   - For each test case, share the prompt and key outputs inline.
   - If the output is a file, tell the user the path so they can inspect it.
   - Ask for feedback: "这个输出效果怎么样？有什么需要调整的？"

### Step 5: Read the feedback

Gather the user's feedback from the conversation. Focus improvements on the test cases where the user had specific complaints. Empty feedback means the user thought it was fine.

---

## Improving the skill

### How to think about improvements

1. **Generalize from the feedback.** You're trying to create skills that can be used many times across many different prompts. Rather than put in fiddly overfitty changes, or oppressively constrictive MUSTs, if there's some stubborn issue, try branching out and using different metaphors, or recommending different patterns of working.

2. **Keep the prompt lean.** Remove things that aren't pulling their weight. Read the transcripts, not just the final outputs — if the skill is making the model waste time doing unproductive things, remove the parts causing that.

3. **Explain the why.** Try hard to explain the *why* behind everything you're asking the model to do. Today's LLMs have good theory of mind. If you find yourself writing ALWAYS or NEVER in all caps, that's a yellow flag — reframe and explain the reasoning instead.

4. **Look for repeated work across test cases.** If all test cases resulted in similar helper scripts, bundle that script in `scripts/` so future invocations don't reinvent the wheel.

### The iteration loop

After improving the skill:

1. Apply your improvements to the skill
2. Rerun all test cases into a new `iteration-<N+1>/` directory, including baseline runs
3. Share results in the conversation
4. Wait for the user to review and give feedback
5. Read the feedback, improve again, repeat

Keep going until:
- The user says they're happy
- The feedback is all positive (everything looks good)
- You're not making meaningful progress

---

## Advanced: Blind comparison

For situations where you want a more rigorous comparison between two versions of a skill, there's a blind comparison system. Read `agents/comparator.md` and `agents/analyzer.md` for the details. The basic idea is: give two outputs to an independent agent without telling it which is which, and let it judge quality.

This is optional and most users won't need it.

---

## Description Optimization

The description field in SKILL.md frontmatter is the primary mechanism that determines whether the AI invokes a skill. After creating or improving a skill, offer to optimize the description for better triggering accuracy.

### Generate trigger eval queries

Create 20 eval queries — a mix of should-trigger and should-not-trigger. Save as JSON:

```json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

The queries must be realistic and something a real OpenLoaf user would actually type. Include Chinese and English variations. Focus on edge cases rather than clear-cut ones.

For **should-trigger** queries (8-10), cover different phrasings — formal and casual, Chinese and English, explicit and implicit.

For **should-not-trigger** queries (8-10), focus on near-misses — queries that share keywords with the skill but actually need something different.

### Manual optimization (OpenLoaf 方式)

Since there's no `claude -p` CLI, optimize the description manually:

1. Send 10-15 test queries in OpenLoaf AI conversation (skill loaded vs. not loaded)
2. Observe which ones correctly trigger the skill
3. Revise the description to improve coverage
4. Repeat until satisfied

Show the user before/after descriptions and discuss what changed.

---

## OpenLoaf 平台说明

OpenLoaf 中，核心工作流相同（起草 → 测试 → 评审 → 改进 → 重复），但测试机制与 Claude Code 有所不同：

**运行测试用例**：没有 `claude -p` CLI。直接在 OpenLoaf AI 对话中手动运行测试提示语。对每个测试用例，发送提示语给 OpenLoaf AI（已挂载待测 skill），观察输出。

**查看结果**：在对话中直接呈现结果。若输出是文件，告知文件路径。逐个测试用例征求反馈："这个输出效果怎么样？有什么需要调整的？"

**基准测试**：跳过定量基准测试（依赖 CLI 基线对比）。专注用户的定性反馈。

**迭代循环**：与主流程相同——改进 skill，重新测试，征求反馈——只是没有浏览器评审界面。

**打包分发**：git 提交即可分发。也可通过 OpenLoaf Settings → Skills → Export 导出 `.zip` 分享。

**更新现有 skill**：
- 保留原始名称（SKILL.md frontmatter name 字段不变）。
- 若路径为只读，先复制到临时目录修改。

**Description 优化**：跳过 `run_loop.py` 优化脚本（需要 claude CLI）。改用手动方式：在对话中发送 10-15 个不同表述，观察 skill 是否正确触发。

---

## Package and Distribute

Distribute the skill by committing to git. The skill becomes available to everyone who uses the project.

To share externally, export via OpenLoaf Settings → Skills → Export to get a `.zip` file.

---

## Reference files

The agents/ directory contains instructions for specialized subagents. Read them when you need to spawn the relevant subagent.

- `agents/grader.md` — How to evaluate assertions against outputs
- `agents/comparator.md` — How to do blind A/B comparison between two outputs
- `agents/analyzer.md` — How to analyze why one version beat another

The references/ directory has additional documentation:
- `references/schemas.md` — JSON structures for evals.json, grading.json, etc.
- `references/openloaf-skill-format.md` — OpenLoaf Skill 文件格式完整规范

---

Repeating one more time the core loop here for emphasis:

- Figure out what the skill is about
- Choose the right scope (`.agents/skills/` vs `~/.agents/skills/`)
- Draft or edit the skill (SKILL.md + openloaf.json)
- Run the AI on test prompts with the skill loaded
- With the user, evaluate the outputs
- Repeat until you and the user are satisfied
- Git commit to distribute the skill

Good luck!
