# Language Lab — project status and next work

Updated: 2026-09-15. This record reconciles the original product brief, the tasks “Build AI-native language demo” and “Respond to greeting,” and the current workspace. Historical claims are distinguished from checks performed during this continuation.

## Product objective

Make the difference between recognition, assisted production, and spontaneous production observable. Persist the evidence and use it to select later situations and controlled reading. The reference user is an adult Chinese speaker learning English; the first demo is text-based and responsive. Preserve the existing visual design.

## Work already present before this continuation

| Area | Implemented behavior | Evidence / boundary |
| --- | --- | --- |
| Interface | Diagnostic, Conversation, Learning map, Reading room, history and item evidence panels | `components/language-lab.tsx`; earlier task reported browser checks of the three main views |
| Learner state | Six stages, evidence history, assistance source, context, session, recency and heuristic confidence | `lib/types.ts`, `lib/engine.ts`; these are transparent rules, not calibrated proficiency estimates |
| Learning loop | Chinese placeholders → supplied expression → assisted reuse → three intervening replies → new unprompted situation → independent evidence | Automated eleven-step acceptance case; the matcher handles a small authored inventory |
| Assistance controls | Hints, immediate reuse, map/history inspection and reading exposure count as support | Existing regression tests cover delayed reuse, exact repetition and session changes |
| Persistence | SQLite in local Node development; D1 binding for the Worker; revision checks prevent stale updates | `lib/repository.ts`, `lib/node-store.ts`, `app/api/learner/route.ts`; SQLite close/reopen and profile isolation test |
| Controlled reading | Phrase matching, inflections, function words, explicit names, basic sense disambiguation, target-presence checks and validated template fallback | `lib/lexical.ts`; both draft and fallback reports are retained |
| Seed data | A synthetic learner with examples across stages, explicitly labeled as sample history | `sampleLearner()`; sample stability is synthetic |
| Runtime recovery | Windows Node preview and Ubuntu WSL Worker preview both previously demonstrated | Windows Workerd failed; the same Worker succeeded in WSL. Docker is not required for normal Node development |
| Previous model integration | A live request to the former provider succeeded in the earlier task | Historical only. The user subsequently reported that provider was unavailable |

The earlier report that preview startup was the “only remaining limitation” was too broad. Research/documentation deliverables and important evaluation gaps remained.

## Work completed in this continuation

- Restored Docker Desktop after its startup log identified an inaccessible stale `sailor-ingest.sock`. Preserved the two zero-byte runtime sockets by moving their parent directory to `C:/Users/GEB/AppData/Local/Docker/run.stale-20260915-0500`. A cached, network-disabled `hello-world` run passed. This is startup recovery, not a fix to Docker's underlying Windows behavior.
- Switched `.env.example`, `.env.local` and `.dev.vars` to `https://api.deepseek.com/chat/completions` and `deepseek-v4-flash`, preserving the user's updated keys. Both local key values matched at inspection time.
- Added DeepSeek V4 non-thinking requests for short readings, sanitized provider errors and rejection of incomplete or malformed responses. Fixed root-only endpoint normalization.
- Changed the UI/API connection label to “configured”; configuration alone does not verify connectivity.
- Corrected delivered reading provenance: a rejected model draft replaced by a template is stored as `original-template`, while its initial provider report remains available.
- Removed deliberately inserted invalid words from normal template generation. Invalid drafts now belong in regression fixtures, not every normal reading request.
- Added `npm run check:provider`, which makes one live request using synthetic state, reports validation and fallback, and does not write a real learner profile.
- Reproduced and fixed the reported “Cross-origin request rejected” error: Next's local request URL differed from the browser's loopback address. The exception requires loopback hosts, matching scheme/port and a matching actual Host header; external origins and different ports remain rejected. Added five origin-check regression tests.
- Reconciled the README's local commands, wrote this work plan, and added `docs/ACCEPTANCE.md`.

## Verification record

- Before the migration: all 23 existing automated tests passed again.
- DeepSeek live check: request succeeded in 1,463 ms. The draft contained unexpected `instead`, with no missing target. The original fallback passed validation. The final source was correctly `original-template`; no learner profile was written. One request establishes connectivity, not general passage quality.
- Local homepage: HTTP 200 at `http://127.0.0.1:5173/`.
- Final verification: all 33 automated tests passed; TypeScript checking and the Vinext production build passed. The Sites build wrapper failed to locate its npm helper on Windows; invoking the project's unchanged `npm run build` command directly completed successfully.
- Live origin probes: `http://127.0.0.1:5173` and `http://localhost:5173` passed origin checks and reached schema validation (400 for deliberately invalid `{}` bodies); a different port and `https://unrelated.example` remained blocked (403). These probes made no profile changes.
- Context-inventory check: all 10 production targets currently have two retrieval domains, confirming the first planned engineering gap below.
- Hosting: the existing Site is registered, with version count 0 and no live URL at inspection. A local preview or successful build is not a deployment.

## Current architecture

The browser sends a typed action and revision to `/api/learner`. The server resolves the profile, optionally asks DeepSeek for a reading draft, applies the deterministic learning/validation rules, and saves only if the revision still matches. Next.js uses local SQLite; the Vinext/Cloudflare build uses D1. The model proposes text and has no direct authority to award evidence or change stages.

The lexical inventory contains 12 product-authored units: 10 production targets and two distinct senses of “bank.” The base vocabulary is a fixed initial assumption. No external linguistic dataset is currently integrated. A proper comparison of at least three resources, their licenses and provenance has not yet been delivered.

## Ordered next work

| Order | Work package | Completion criterion |
| --- | --- | --- |
| 1 | Repair and verify the real learner loop | Add a third genuinely distinct retrieval domain for taught expressions. Current retrieval templates cycle through only two domains, while `stable` requires three; sample data and a unit test of the rule do not prove that the normal taught-expression journey can reach it. Test the full journey across two sessions and seven simulated days, then execute the manual browser acceptance guide |
| 2 | Complete the research and engineering handover | Compare at least three serious linguistic resources using primary license/provenance sources; record selected and rejected options, commercial-use conditions, attribution, size, morphology, senses and integration value. Finish the technical decision record, architecture/data-model explanation and limitations inventory |
| 3 | Improve controlled reading quality | Measure first-pass acceptance and fallback on a fixed multi-target evaluation set. Add at most a bounded repair/regeneration attempt using the validator's findings; retain validated fallback. Report final source, latency and acceptance rate honestly |
| 4 | Improve the conversation's judgments | Build a labeled set of valid paraphrases, phrase mentions, wrong senses, negation and supported reuse. Measure false independent-credit decisions and missed valid production before adding broader model-assisted interpretation. Keep final stage changes evidence-driven |
| 5 | Prepare a shareable release | Establish Git/source history, complete local and WSL acceptance, verify hosted identity and runtime configuration, then handle private hosting as a distinct release step |

The next engineering batch is item 1. Item 2 can be prepared independently, but no extra Codex tasks or worktrees have been created. Do not expand into voice, payments, social features or a large vocabulary library before the required loop and handover are complete.

## Known limitations

- “Independent” means that the current form/context/assistance rules accepted a response. It does not establish semantic correctness or real-world proficiency.
- Three intervening replies are a demo separation rule, not a validated memory model; changing sessions alone does not remove support.
- Natural stable-state reachability after teaching is incomplete as described above. The displayed seeded stable example does not validate that journey.
- Chinese placeholder matching and lexical disambiguation use authored lists and regular expressions. Unrecognized input is not robustly understood.
- The reading meaning check has a fixed obvious distractor and a predictable correct-option position. It provides weak evidence.
- A rejected model passage currently becomes a complete original template, rather than a repaired model passage. Transport/API failures remain visible and do not silently count as a successful generation.
- Local browsers share the `local-demo` profile. Hosted identity isolation relies on the platform's trusted authentication boundary and still needs release acceptance.
- The workspace was not a Git repository at inspection. Files and tests exist, but there is no local commit history to use as evidence of prior edits.

## Next three experiments

1. **Evidence classification:** compare the engine's assisted/independent judgments with human labels across direct reuse, paraphrases, valid alternatives and wrong-sense examples. Measure false independent credit separately from missed matches.
2. **Controlled reading yield:** measure initial acceptance, fallback frequency, naturalness and latency across the authored target set. Compare the current single-draft route with a single validation-informed retry.
3. **Delayed transfer:** test whether users can produce taught expressions in genuinely different contexts across later sessions. Compare the current short turn gap with a longer time gap; keep research conclusions provisional.

---

# 中文译文

更新日期：2026-09-15。本记录将原始产品需求、任务“Build AI-native language demo”和“Respond to greeting”中的记录与当前工作区进行核对，并区分历史报告与本次重新执行的检查。

## 产品目标

让理解、辅助产出和自主产出的区别可以被观察；持续保存证据，并利用这些证据安排后续情境和受控阅读。首版面向母语为中文、学习英语的成年用户，以文字交互为主，支持桌面和移动端，并保留现有视觉设计。

## 本次继续之前已经存在的工作

| 领域 | 已实现的行为 | 证据与边界 |
| --- | --- | --- |
| 界面 | 诊断、Conversation、Learning map、Reading room、历史记录与单词条证据面板 | `components/language-lab.tsx`；之前报告已在浏览器中检查三个主要视图 |
| 学习状态 | 六阶段、证据历史、辅助来源、情境、会话、时间信息和启发式置信度 | `lib/types.ts`、`lib/engine.ts`；透明规则不等于经过校准的能力测量 |
| 学习闭环 | 中文占位 → 提供表达 → 辅助复用 → 三次间隔回复 → 不提示表达的新情境 → 自主产出证据 | 自动化十一项验收用例；匹配器只覆盖少量自编词条 |
| 辅助控制 | 提示、立即复用、查看地图或历史、阅读接触均计为辅助 | 已有回归测试覆盖延迟复用、原句重复和切换会话 |
| 持久化 | 本地 Node 使用 SQLite，Worker 使用 D1；版本检查防止旧状态覆盖新记录 | SQLite 测试覆盖关闭重开和不同学习者隔离 |
| 受控阅读 | 短语、词形、功能词、明确人名、基本词义、目标存在性检查和模板回退 | `lib/lexical.ts`；保留原草稿与回退内容的检查报告 |
| 示例数据 | 明确标注为合成历史的学习者，展示不同阶段 | `sampleLearner()`；稳定阶段示例来自合成数据 |
| 运行环境 | 已分别演示 Windows Node 预览和 Ubuntu WSL Worker 预览 | 原生 Windows Workerd 启动失败，同一 Worker 在 WSL 成功；普通 Node 开发不需要 Docker |
| 原模型接入 | 上一个任务曾成功调用旧提供器 | 仅为历史结果；用户后来明确表示旧接口已不可用 |

之前将预览启动称为“唯一剩余限制”的表述过于宽泛。研究、文档交付以及重要的效果验证仍未完成。

## 本次已经完成的工作

- 根据日志定位 Docker 的残留 `sailor-ingest.sock`，将包含两个零字节临时套接字的目录移到 `C:/Users/GEB/AppData/Local/Docker/run.stale-20260915-0500` 保存。Docker 恢复启动，已有 `hello-world` 镜像在禁用网络时运行成功。这是启动恢复，并未修复 Docker 自身的 Windows 问题。
- 将三个环境配置文件切换到 DeepSeek 接口及 `deepseek-v4-flash`，保留用户已替换的密钥；检查时两个本地密钥一致。
- 为短阅读请求关闭 DeepSeek V4 思考模式，增加脱敏的提供器错误信息，拒绝不完整或异常响应，并修复仅填写根地址时出现双斜杠的问题。
- 将连接状态改为“已配置”：仅存在凭据不能证明实际连通。
- 修正最终阅读来源：模型草稿被拒后使用模板时，记录为 `original-template`，同时保留原模型草稿的验证报告。
- 不再给正常模板故意插入错误词汇；这类无效草稿只保留在回归测试中。
- 新增 `npm run check:provider`，用合成状态执行一次真实请求，报告验证和回退结果，不写入真实学习者记录。
- 复现并修复用户报告的 “Cross-origin request rejected”：Next 构造的本地请求地址与浏览器使用的回环地址不同。兼容分支要求双方为回环地址、协议及端口相同、实际 Host 头匹配；外部来源和不同端口仍会被拒绝。新增五个来源检查回归测试。
- 修正 README 的本地运行说明，编写本计划和 `docs/ACCEPTANCE.md` 人工验收指南。

## 验证记录

- 修改前重新运行：原有 23 个自动化测试全部通过。
- DeepSeek 真实检查：1,463 毫秒内成功响应。草稿包含不在允许词表中的 `instead`，目标表达没有遗漏；模板回退通过验证，最终来源正确记录为 `original-template`，没有写入学习者档案。单次请求只能证明连通，不能证明整体阅读质量。
- 本地首页 `http://127.0.0.1:5173/` 返回 HTTP 200。
- 最终验证：33 个自动化测试、TypeScript 类型检查、Vinext 生产构建全部通过。Sites 构建包装器在 Windows 上未能定位 npm 辅助文件；直接执行项目原有的 `npm run build` 后构建成功。
- 真实来源探测：`http://127.0.0.1:5173` 和 `http://localhost:5173` 通过来源检查并进入结构验证，故意无效的 `{}` 请求体返回 400；不同端口及 `https://unrelated.example` 仍返回 403。探测没有修改档案。
- 情境清单检查：10 个产出目标目前都只有两个回忆领域，确认了下文排在首位的工程缺口。
- 托管：检查时 Site 已注册，但版本数为 0，没有线上地址。本地预览或构建成功不等于完成部署。

## 当前架构

浏览器把操作和版本号发送到 `/api/learner`；服务器读取学习者状态，必要时向 DeepSeek 请求阅读草稿，执行确定性的学习和验证规则，并只在版本仍匹配时保存。Next.js 使用本地 SQLite，Vinext/Cloudflare 构建使用 D1。模型只能建议文字，不能直接授予学习证据或修改阶段。

词库目前有 12 个产品自编词条：10 个产出目标，以及 “bank” 的两个独立词义。基础词汇表是固定的初始假设。目前没有接入外部语言数据集，也没有完成至少三种资源的许可和来源比较。

## 后续工作顺序

| 顺序 | 工作包 | 完成标准 |
| --- | --- | --- |
| 1 | 修复并验收真实学习闭环 | 为教过的表达补足第三个有实质区别的回忆情境领域。当前回忆模板只在两个领域间循环，而 `stable` 要求三个领域；示例数据及规则单元测试无法证明正常流程可以到达。用两个会话、模拟七天测试完整路径，再执行浏览器人工验收 |
| 2 | 补齐研究与工程交接 | 根据一手许可和来源资料比较至少三种严肃语言资源，记录选择、排除理由、商业使用条件、署名、规模、词形、词义和接入价值；完成技术决策记录、架构与数据模型说明、已知限制清单 |
| 3 | 提升受控阅读质量 | 用固定的多目标评测集测量首轮通过率及回退率；依据验证器结果增加有次数上限的修复或重生成，保留验证过的回退模板；如实报告最终来源、时延和通过率 |
| 4 | 改善对话判断 | 建立有效改写、仅提及表达、错误词义、否定句、辅助复用的人工标注集；先测量误判自主产出和漏检，再扩展模型辅助解释；最终阶段变化仍由证据决定 |
| 5 | 准备可分享版本 | 建立 Git 源码历史，完成本地及 WSL 验收，检查线上身份和运行配置，再作为独立发布步骤处理私有托管 |

下一个工程批次是第 1 项。第 2 项可以独立准备；目前没有创建额外 Codex 任务或工作树。在必需闭环与交接完成前，不扩展语音、支付、社交或大规模词库。

## 已知限制

- “自主产出”只表示当前形式、情境和辅助规则接受了回答，并不能证明语义正确或实际英语能力。
- 三次间隔回复只是演示规则，不是已验证的记忆模型；单纯切换会话不会清除辅助影响。
- 教学后正常到达稳定阶段的路径尚不完整；合成的稳定阶段示例不能证明这条路径成立。
- 中文占位和词义判断依赖自编列表及正则表达式，对未覆盖输入的理解能力有限。
- 阅读理解题的干扰项固定且明显，正确答案位置可预测，因此证据很弱。
- 模型草稿不合格时，目前整篇替换为原创模板，而不是修复模型草稿；网络或接口错误会明确显示，不会假装生成成功。
- 本地浏览器共享 `local-demo` 档案；线上隔离依赖平台可信身份边界，仍需发布验收。
- 检查时工作区并非 Git 仓库；源码和测试存在，但没有本地提交历史可用于核实之前的修改。

## 接下来三个实验

1. **证据分类：** 对比引擎与人工标注对直接复用、改写、其他有效表达和错误词义的判断，分别统计误授自主产出与漏检。
2. **受控阅读产出：** 在自编目标集合上测量初稿通过率、回退频率、自然度和时延；比较单次生成与基于验证结果再尝试一次的效果。
3. **延迟迁移：** 检验用户能否在后续会话的不同情境中自主使用教过的表达，比较短回合间隔与更长时间间隔，谨慎解释研究结论。
