# Language Lab — user guide and basic implementation

This document describes the product as it currently behaves. Language Lab has two user-facing areas: the **English atlas** at `/`, for exploring the English lexical network, and the **Practice lab** at `/practice`, for collecting learning evidence through conversation and controlled reading.

## 1. Start the application

### Local use

Requirements:

- Node.js 22.13.0 or later
- Project dependencies installed with `npm ci`

From the project root, run:

```powershell
npm run dev
```

Then open:

- `http://127.0.0.1:5173/` — English atlas
- `http://127.0.0.1:5173/practice` — Practice lab

Local use stores all browser activity in the shared `local-demo` learner profile. A private browser window does not create a separate profile. Hosted use identifies each learner through the platform's authenticated user ID.

### Optional AI-generated readings

The Practice lab works without an AI provider by using original reading templates. To allow model-generated reading drafts, copy the variables in `.env.example` to `.env.local` and supply a valid `AI_API_KEY`. The model proposes text only; deterministic rules still validate the passage and update learning evidence.

## 2. English atlas

The home page visualizes Open English WordNet 2025 as a navigable graph. A **graph** is a network of nodes and relationships. Here, nodes include navigation groups, word forms, individual meanings, concepts, and verb patterns.

### Find and explore language

1. Enter a word or expression in **Find a word or expression**. Search uses normalized base forms, so try the dictionary form when an inflected form has no result.
2. Select a search result to make it the center of the graph.
3. Select a node once to inspect its definition, pronunciation, examples, parent, and visible branches in the right panel.
4. Double-click a graph node, or use **Explore this node**, to load its local neighborhood.
5. Use **Go to parent** or **Whole network** to move back toward broader categories.

### Adjust the view

- **Radial / Top-down** changes only the visual layout.
- **Depth** controls how many relationship levels are expanded, from 1 to 5.
- **Density** controls the maximum visible node budget, from 20 to 350.
- **Fit** recenters and scales the visible graph.
- Mouse wheel zooms, dragging the background moves the graph, and **Next branches** pages through a large group.

The atlas contains 135,969 lexical entries, 185,129 senses, 107,519 concepts, and 39 verb frames from the pinned Open English WordNet release. It is a lexical map, not a complete model of grammar, collocation, pragmatics, listening, pronunciation, or current usage frequency. The current interface displays nodes as **Not yet assessed**; absence of recorded evidence must not be interpreted as lack of knowledge.

## 3. Practice lab

The Practice lab distinguishes seeing an expression, recognizing its meaning, using it with support, and using it independently. It records the evidence behind each judgment instead of presenting a single mastery score.

### First use

Choose one of two starting paths:

- Complete the short diagnostic: enter a display name, answer one meaning question, and write a short response.
- Select **Explore sample profile** to open Lin's synthetic example history. Sample evidence is labeled and is not presented as real learner data.

The diagnostic is only a starting signal. One correct answer is weak recognition evidence; it is not proof that the learner can independently use the expression.

### Conversation

1. Read the situation and write a short, contextual English response.
2. If an English expression is missing, put the supported Chinese placeholder inside the response, such as `I wanted to 表达感谢, but I didn't know how.` The coach will supply an English expression.
3. Rewrite the idea in your own sentence. Immediate reuse is recorded as **With support**.
4. Answer the intervening situations. Bridge responses must contain at least four English words, and repeated recent messages are rejected because they do not provide new evidence.
5. After at least three intervening responses, the system may present a fresh situation without showing the target expression. A new, contextual use can be recorded as **Independent**.

Use **Give me a hint** when needed. Opening the conversation history or Learning map, requesting a hint, and viewing an existing or newly generated reading expose language and therefore count as support for later judgments. Starting a new session preserves both evidence and recent support; it does not turn assisted reuse into independent use.

The current authored inventory recognizes these main targets: `express gratitude`, `appreciate`, `reschedule`, `look forward to`, `make time for`, `raise a concern`, `take into account`, `meet a deadline`, `figure out`, and `put off`. It also contains two separate senses of `bank`. Other valid English can still communicate successfully, but may not be classified by the demo.

### Learning map

Open **Learning map** to review every tracked item by stage:

| Stage | Meaning in this project |
| --- | --- |
| Not yet seen | No recorded evidence |
| Encountered | The item was displayed or appeared in context |
| Understood | Its meaning was selected correctly |
| With support | It was produced after visible help or in the same support window |
| Independent | It was used in a new valid context without recent visible help |
| Stable | It met the repeated-use rule across time, sessions, and domains |

Select an item to see the evidence timeline, source, context, reason, timestamp, weight, and heuristic confidence. A **heuristic** is an explicit engineering rule of thumb, not a statistically calibrated probability. Search filters the map by English expression or Chinese gloss. **Recent selection decisions** explains why the engine chose situations and classifications.

The current stable rule requires at least three accepted independent productions across three domains, two sessions, and a span of seven days. A stable item falls back to Independent after 60 days without qualifying evidence. The normal taught-expression journey does not yet reliably reach three distinct retrieval domains, so stable status should be treated as an experimental rule rather than a validated learning outcome.

### Reading room

1. Select **Create my reading**.
2. Read the short passage and note its one target expression.
3. Answer the meaning check once.
4. Optionally select **Inspect the lexical check** to review each token and validation pass.

The system selects one target from the learner state, surrounds it with mostly permitted language, and validates the result. If an AI draft contains unexpected language, an ambiguous sense, or a missing target, it is replaced with a validated original template. Merely seeing the passage creates exposure/support evidence; a correct meaning check creates weak recognition evidence. Neither action counts as independent production.

## 4. Saving, identity, and common messages

Each accepted action is saved immediately. The interface shows **Saving…** and then **Saved to your learner profile**. Refreshing the page or starting a new session keeps existing evidence.

- **Your profile changed in another tab**: another request saved a newer revision. Reload before retrying; the application avoids silently overwriting the newer state.
- **Cross-origin request rejected**: the write did not originate from the same site and was blocked.
- **Sign in to access your learner profile**: hosted identity is missing. Use the platform sign-in flow.
- **Learning storage is unavailable**: the database or its migration is unavailable. Graph exploration may remain read-only.
- **Reading provider failure**: no passage or learning update is saved for the failed request.

## 5. Basic implementation

### System shape

The browser is a Next.js/React client. It requests graph data from `/api/graph` and sends Practice-lab actions to `/api/learner`. API routes validate input, identify the learner, load current state, apply deterministic rules, and save the next revision. Local development uses Node's SQLite adapter; the Cloudflare build uses the same repository interface with D1, Cloudflare's serverless SQL database.

```text
Browser UI
  ├─ English atlas ── GET /api/graph ── sharded WordNet JSON
  │                                      └─ optional learner overlay
  └─ Practice lab ─── GET/POST /api/learner
                         ├─ evidence engine
                         ├─ lexical validator
                         ├─ optional text-generation provider
                         └─ SQLite locally / D1 when hosted
```

### English graph data path

The import script transforms the pinned Open English WordNet release into static JSON shards under `public/graph-data/oewn-2025`. **Sharding** means dividing a large dataset into smaller files. Node lookups and normalized-form searches load only the required shards, keep a small in-memory cache, and enforce depth and node budgets so one large branch cannot flood the browser. Cytoscape renders the returned local view and performs client-side layout, zooming, selection, and panning.

The graph API also returns an optional learner overlay from the database. Back-end routes already support recording form exposure, AI-reviewed contextual writing, and annotations, but the current atlas interface does not yet expose those write actions. Therefore the visible home page should currently be understood primarily as an explorer.

### Evidence engine

The Practice lab stores append-only evidence events for each authored lexical item. An event records its type, time, turn, context, domain, session, source, original text, reason, strength, and whether support was involved. The item stage and confidence are derived again from the event history rather than being accepted directly from the client.

Production classification is conservative and rule-based. It checks an authored expression pattern, sentence length, the active situation, statements of inability or metalinguistic mention, recent support, exact reuse, intervening turns, and whether the context changed. Not observing the planned expression records an opportunity outcome, but the interface explicitly notes that another wording may still be valid.

### Controlled reading

When a reading is requested, the engine chooses a target item and builds a permitted vocabulary from the fixed base list plus items with sufficient prior evidence. An optional OpenAI-compatible provider may propose a short passage. The deterministic lexical validator then performs phrase matching, tokenization, limited lemmatization, function-word and name checks, basic sense checks, and target-presence checks. Only a passing passage is shown; otherwise the engine uses its own passing template.

The provider cannot directly grant evidence, change a stage, or write learner state. This separation keeps generated content advisory while deterministic application code remains responsible for learning-state transitions.

### Persistence and request safety

Learner state is stored as JSON with a numeric revision. Every write includes the revision that the browser last read. The database updates only when that revision still matches, a technique called **optimistic concurrency control**. It prevents two tabs from silently overwriting each other without holding a long database lock.

Request bodies are schema-validated and size-limited. Writes require a same-origin request. Hosted records use the trusted authenticated user ID rather than email; loopback development uses the shared `local-demo` identity. API responses disable caching, provider credentials are kept server-side, and unexpected internal errors are replaced with user-safe messages.

## 6. Current boundaries

- The evidence rules are transparent prototypes, not validated proficiency measurements or pedagogical diagnoses.
- Expression recognition relies on a small authored inventory and regular expressions; it does not understand unrestricted English.
- The English atlas is broad lexical reference data, while the Practice lab currently tracks only its small authored learning inventory. The two surfaces are not yet one unified learning model.
- Reading validation controls vocabulary mechanically; passing it does not prove that every learner understands every word or that the passage is natural.
- The meaning check has only a simple fixed distractor and provides weak evidence.
- Voice, listening, pronunciation, free-form grammar assessment, and comprehensive collocation coverage are not implemented.

For a repeatable QA walkthrough, see [Manual acceptance guide](ACCEPTANCE.md). For verified status, known gaps, and next experiments, see [Project status](PROJECT_STATUS.md).

---

# 中文译文

# Language Lab——用户使用说明与基本实现原理

本文说明项目当前实际具备的功能。Language Lab 包含两个面向用户的区域：`/` 路径下用于探索英语词汇网络的 **English atlas（英语图谱）**，以及 `/practice` 路径下通过对话和受控阅读收集学习证据的 **Practice lab（练习实验室）**。

## 1. 启动应用

### 本地使用

环境要求：

- Node.js 22.13.0 或更高版本
- 使用 `npm ci` 安装项目依赖

在项目根目录运行：

```powershell
npm run dev
```

然后打开：

- `http://127.0.0.1:5173/`——英语图谱
- `http://127.0.0.1:5173/practice`——练习实验室

本地使用时，所有浏览器活动都写入共享的 `local-demo` 学习者档案。浏览器隐私窗口不会创建独立档案。在线托管时，系统通过平台提供的已认证用户 ID 区分学习者。

### 可选的 AI 阅读生成

即使不配置 AI 提供器，练习实验室也能使用项目自带的阅读模板运行。如果需要允许模型生成阅读草稿，请将 `.env.example` 中的变量复制到 `.env.local`，并填写有效的 `AI_API_KEY`。模型只能提出文本；段落验证和学习证据更新仍由确定性规则完成。

## 2. 英语图谱

首页将 Open English WordNet 2025 可视化为可导航的图。这里的“图”是由节点及其关系构成的网络；节点包括导航分组、词形、独立词义、概念和动词句型。

### 查找并探索语言

1. 在 **Find a word or expression** 中输入单词或表达。搜索使用规范化后的基本形式；如果屈折变化形式没有结果，请尝试词典原形。
2. 选择搜索结果，使其成为图谱中心。
3. 单击节点，在右侧面板查看定义、发音、例句、父节点和当前可见分支。
4. 双击图中节点，或选择 **Explore this node**，加载该节点附近的关系。
5. 使用 **Go to parent** 或 **Whole network** 返回更上层的分类。

### 调整视图

- **Radial / Top-down** 只改变图谱的视觉布局。
- **Depth** 控制展开的关系层数，范围为 1～5。
- **Density** 控制可见节点数量上限，范围为 20～350。
- **Fit** 重新居中并缩放当前图谱。
- 鼠标滚轮用于缩放，拖动背景用于平移；大型分组可用 **Next branches** 翻页。

图谱包含固定版本 Open English WordNet 中的 135,969 个词汇条目、185,129 个词义、107,519 个概念和 39 个动词句型。它是词汇关系图，不是完整的语法、搭配、语用、听力、发音或当代使用频率模型。当前界面将节点显示为 **Not yet assessed**；没有记录证据不能解释为用户不会该内容。

## 3. 练习实验室

练习实验室区分“见过表达”“理解含义”“在辅助下使用”和“自主使用”。它保存每次判断背后的证据，而不是只给出单一的掌握分数。

### 首次使用

可以从以下两种方式开始：

- 完成简短诊断：输入显示名称，回答一道词义题，并写一条简短回复。
- 选择 **Explore sample profile**，打开 Lin 的合成示例历史。示例证据带有明确标记，不会被描述为真实学习者数据。

诊断只用于提供初始信号。一次正确回答只是较弱的理解证据，并不能证明学习者能够自主使用该表达。

### 对话练习

1. 阅读情境，并写一条简短、有上下文的英语回复。
2. 如果缺少某个英语表达，可以在回复中嵌入系统支持的中文占位，例如 `I wanted to 表达感谢, but I didn't know how.`。教练会提供对应的英语表达。
3. 用自己的句子重新表达。紧接着复用会被记录为 **With support（有辅助）**。
4. 回答中间的过渡情境。过渡回复至少需要四个英语单词；最近重复过的消息会被拒绝，因为它不能提供新证据。
5. 至少完成三次间隔回复后，系统可能在不显示目标表达的情况下提供一个新情境。新的、符合情境的使用可以被记录为 **Independent（自主使用）**。

需要时可以选择 **Give me a hint**。打开对话历史或 Learning map、请求提示，以及查看已有或新生成的阅读内容都会显示语言，因此会在后续判断中计为辅助。开始新会话会保留证据和近期辅助记录，不会把辅助复用自动变成自主使用。

当前自编词条库主要识别：`express gratitude`、`appreciate`、`reschedule`、`look forward to`、`make time for`、`raise a concern`、`take into account`、`meet a deadline`、`figure out` 和 `put off`，另外还包含 `bank` 的两个独立词义。其他正确英语仍可能完成沟通，但不一定会被本演示系统分类。

### 学习地图

打开 **Learning map**，可以按阶段查看所有被跟踪的词条：

| 阶段 | 在本项目中的含义 |
| --- | --- |
| Not yet seen | 没有已记录证据 |
| Encountered | 词条曾被显示或在上下文中出现 |
| Understood | 正确选择了词义 |
| With support | 在看到帮助后，或仍处于辅助窗口内完成产出 |
| Independent | 没有近期可见帮助，并在新的有效情境中使用 |
| Stable | 满足跨时间、跨会话和跨领域的重复使用规则 |

选择词条后，可以查看证据时间线、来源、情境、理由、时间戳、权重和启发式置信度。“启发式”是明确的工程经验规则，不是经过统计校准的概率。搜索框可按英语表达或中文释义筛选。**Recent selection decisions** 用于解释引擎选择情境和分类结果的原因。

当前稳定规则要求：至少有三次被接受的自主产出，覆盖三个领域、两个会话，并且时间跨度至少七天。稳定词条在 60 天没有合格证据后会退回 Independent。正常教学流程目前还不能稳定到达三个不同的检索领域，因此 Stable 应被视为实验性规则，而不是经过验证的学习成果。

### 阅读室

1. 选择 **Create my reading**。
2. 阅读短文，并留意其中唯一的目标表达。
3. 完成一次词义检查。
4. 如需查看验证细节，可以选择 **Inspect the lexical check**，检查每个词元和每轮验证。

系统会根据学习者状态选择一个目标词条，用大部分已允许的语言包围它，并验证结果。如果 AI 草稿含有意外词汇、歧义词义或缺少目标表达，系统会用通过验证的原创模板替换它。仅阅读短文只会产生接触／辅助证据；正确完成词义检查只会产生较弱的理解证据。两者都不计为自主产出。

## 4. 保存、身份与常见提示

每个被接受的操作都会立即保存。界面先显示 **Saving…**，随后显示 **Saved to your learner profile**。刷新页面或开始新会话都不会删除已有证据。

- **Your profile changed in another tab**：另一个请求保存了更新版本。请先重新加载再重试；应用会避免静默覆盖新状态。
- **Cross-origin request rejected**：写入请求不是从当前站点发出，因此被阻止。
- **Sign in to access your learner profile**：在线环境缺少用户身份，请使用平台登录流程。
- **Learning storage is unavailable**：数据库或数据库迁移不可用；图谱可能仍能以只读方式浏览。
- **Reading provider failure**：失败请求不会保存短文，也不会更新学习证据。

## 5. 基本实现原理

### 系统结构

浏览器端使用 Next.js 和 React。英语图谱从 `/api/graph` 获取图数据，练习实验室把操作发送到 `/api/learner`。API 路由负责验证输入、识别学习者、读取当前状态、执行确定性规则并保存新版本。本地开发使用 Node 的 SQLite 适配器；Cloudflare 构建则通过相同的存储接口使用 D1——Cloudflare 的无服务器 SQL 数据库。

```text
浏览器界面
  ├─ 英语图谱 ────── GET /api/graph ── 分片的 WordNet JSON
  │                                      └─ 可选的学习者覆盖层
  └─ 练习实验室 ──── GET/POST /api/learner
                         ├─ 证据引擎
                         ├─ 词汇验证器
                         ├─ 可选文本生成提供器
                         └─ 本地 SQLite / 在线 D1
```

### 英语图谱数据路径

导入脚本把固定版本的 Open English WordNet 转换为 `public/graph-data/oewn-2025` 下的静态 JSON 分片。“分片”是指把大型数据集拆成较小文件。节点查询和规范化词形搜索只加载所需分片，并使用小型内存缓存；深度限制和节点预算可以避免某个大型分支淹没浏览器。Cytoscape 负责渲染 API 返回的局部视图，并在客户端完成布局、缩放、选择和平移。

图谱 API 还会返回数据库中的可选学习者覆盖层。后端路由已经支持记录词形接触、由 AI 审阅的上下文写作以及节点注释，但当前图谱界面尚未开放这些写入操作。因此，目前可见的首页应主要理解为一个浏览器。

### 证据引擎

练习实验室会为每个自编词条保存只追加的证据事件。事件包含类型、时间、回合、情境、领域、会话、来源、原文、理由、强度，以及是否涉及辅助。词条阶段和置信度根据完整事件历史重新推导，而不是直接接受客户端提交的结论。

产出分类采用保守的规则系统。它会检查自编表达模式、句子长度、当前情境、表示不会或讨论语言本身的说法、近期辅助、逐字复用、间隔回合，以及上下文是否变化。没有观察到计划中的表达时，系统会记录这次机会的结果，但界面会明确说明：其他表达方式仍可能是正确的。

### 受控阅读

用户请求阅读时，引擎会选择一个目标词条，并使用固定基础词表及已有足够证据的词条构建允许词汇。可选的 OpenAI 兼容提供器可以提出短文草稿。确定性词汇验证器随后执行短语匹配、分词、有限的词形还原、功能词和人名检查、基础词义检查，以及目标存在性检查。只有通过验证的短文才会显示；否则引擎使用自身已验证的模板。

模型不能直接授予证据、改变阶段或写入学习者状态。这种分离让生成内容只承担建议作用，而学习状态转换始终由确定性的应用代码负责。

### 持久化与请求安全

学习者状态以 JSON 和数字版本号的形式保存。每次写入都会携带浏览器最后读取到的版本；只有数据库中的版本仍然匹配时才执行更新。这种技术称为“乐观并发控制”，它可以在不长期占用数据库锁的情况下，防止两个浏览器标签页静默覆盖彼此的数据。

请求体经过结构验证，并设有大小限制。写操作必须来自同源请求。在线记录使用可信的已认证用户 ID，而不是电子邮箱；本地回环开发使用共享的 `local-demo` 身份。API 响应禁用缓存，提供器密钥只保留在服务器端，未预期的内部错误会替换成适合向用户展示的安全提示。

## 6. 当前边界

- 证据规则是透明的原型，并非经过验证的语言能力测量或教学诊断。
- 表达识别依赖少量自编词条和正则表达式，不能理解不受限制的英语。
- 英语图谱提供广泛的词汇参考数据，而练习实验室目前只跟踪少量自编学习词条；两个区域尚未形成统一的学习模型。
- 阅读验证以机械方式控制词汇；通过验证并不能证明学习者理解每个词，也不能证明短文自然。
- 词义题只有一个简单且固定的干扰项，只能提供较弱证据。
- 语音、听力、发音、自由语法评估和完整搭配覆盖尚未实现。

如需可重复的质量验收流程，请参阅 [人工验收指南](ACCEPTANCE.md)。如需了解已验证状态、已知缺口和下一步实验，请参阅 [项目状态](PROJECT_STATUS.md)。
