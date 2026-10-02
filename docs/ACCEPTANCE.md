# Manual acceptance guide

Use a separate local database so acceptance work does not change an existing learner's evidence. Run these commands from the project root in a separate PowerShell terminal:

```powershell
$acceptanceDatabase = Join-Path (Get-Location).Path ('.local/acceptance-' + [guid]::NewGuid().ToString('N') + '.sqlite')
$env:LANGUAGE_LAB_DB_PATH = $acceptanceDatabase
npm run dev -- --port 5174
```

Open `http://127.0.0.1:5174`. Stop this test server with Ctrl+C when finished. The ordinary preview on port 5173 continues to use its own database. A fresh private browser window alone does not isolate local learner data.

## Main learning loop

1. Enter a test name. In the diagnostic, select the meaning that changes a meeting's time. For the production answer, use `I wanted to 表达感谢, but I didn't know how.` Submit the diagnostic.
2. Verify that the coach supplies an English expression and records support. Submit `I wanted to express my gratitude for your help.` The sidebar should show supported use, with no independent use of this target.
3. Do not open the map, history, hints or Reading room during the delay; those surfaces show language and count as assistance.
4. Respond to the three intervening situations with `I will finish my work first.`, then `I would go to the park with my friend.`, then `I will take the bus home today.`
5. Verify that a new situation concerns a volunteer finding a lost book at a community library. Its prompt must not name “express gratitude.”
6. Submit `I would like to express my gratitude for finding my book.` Verify that the independent count increases and the notice records independent use, without claiming stable knowledge.
7. Now open Learning map and select “express gratitude.” Confirm separate help/supply, assisted and spontaneous records, with reasons, contexts, source and timestamps. Opening the map adds a later support event; it must not rewrite the earlier independent event.
8. Refresh the page, then start a new session. Confirm that stage and evidence survive. Return to Conversation and verify that the next selected situation reflects the learner state.

## Counterexamples

Repeat from a fresh test database for each case:

- Request a hint in the library situation before answering: the response must count as assisted.
- Open the map/history before answering, even if you then start a new session: visible assistance must still count.
- Reuse the exact supplied sentence after the delay: it must remain assisted.
- Send `ok` in a bridge situation, or repeat an immediately preceding bridge reply: the request must be rejected without advancing the delay.
- Say `I don't know how to express gratitude for the book.`: mentioning an expression inside a statement of inability must not earn independent credit.
- Say `Thank you so much for finding my book.`: the system may record that the planned target was not observed, but must not claim that this alternative is invalid English or proof of inability.

## Controlled reading and DeepSeek

Open Reading room after completing the main loop. With a configured key, create a reading. Inspect the lexical check: permitted words, target expressions, names, unexpected items and each attempt must be inspectable. A passing model draft may be delivered directly. A failing draft must be replaced with a passing original template, recorded as `original-template`. Reading alone must not create independent-production evidence; the meaning check creates only weak recognition evidence and cannot be submitted twice for the same passage.

For a separate live connectivity check using synthetic state and no profile writes:

```powershell
npm run check:provider
```

This sends one real request using `.env.local`. `providerReached: true` establishes a response; `draftPassed` and `deliveredSource` distinguish a usable model draft from validated fallback. A configuration label by itself is not a connectivity result.

Automated checks for malformed replies, provider HTTP errors, timeouts, lexical ambiguity, preservation of state, profile isolation and stale writes are included in:

```powershell
npm test
npm run typecheck
```

## Remaining acceptance gap

The normal taught-expression path currently cycles between two retrieval domains, while stable status requires three domains, two sessions and seven days. The seeded stable example and rule-level tests are not a substitute for this missing end-to-end case. Record stable-path acceptance as pending until the context set and full-path test are corrected. Multi-day research outcomes and responsive browser acceptance also require explicit recorded checks; do not infer them from unit-test success.

Record the run date, browser/viewport, initial profile, passed steps, failures and observed evidence. The automated engine scenario has been rerun; this guide's complete browser sequence has not yet been executed in the current continuation.

---

# 中文译文

请使用独立的本地数据库，以免验收改变现有学习者的证据。在项目根目录下新开一个 PowerShell 终端，执行上面的启动命令，然后打开 `http://127.0.0.1:5174`。结束时按 Ctrl+C 停止测试服务器；5173 端口的普通预览仍使用原有数据库。仅开浏览器隐私窗口并不能隔离本地学习者数据。

## 主要学习闭环

1. 输入测试姓名。在诊断中选择“更改会议时间”的含义；产出回答填写 `I wanted to 表达感谢, but I didn't know how.`，然后提交。
2. 确认教练提供英文表达并记录辅助。提交 `I wanted to express my gratitude for your help.`。侧栏应显示辅助使用，目标表达尚无自主产出记录。
3. 在间隔期间不要打开地图、历史、提示或 Reading room，因为这些界面会显示语言并计为辅助。
4. 依次回复三个间隔情境：`I will finish my work first.`、`I would go to the park with my friend.`、`I will take the bus home today.`。
5. 确认新情境是社区图书馆的志愿者找回了丢失的书，提示中不得直接点出 “express gratitude”。
6. 提交 `I would like to express my gratitude for finding my book.`。自主产出计数应增加，通知应记录自主使用，但不能宣称已经稳定掌握。
7. 现在打开 Learning map，选择 “express gratitude”，检查求助、提供表达、辅助使用、自主使用的独立记录及其原因、情境、来源和时间。打开地图会增加之后的辅助事件，不能改写此前的自主产出事件。
8. 刷新页面，再开启新会话，确认阶段和证据仍然存在；回到 Conversation，确认下一情境反映学习者状态。

## 反例检查

每个反例都从新的测试数据库开始：

- 在图书馆情境回答前请求提示，应计为辅助产出。
- 回答前打开地图或历史，即使随后新开会话，也必须继续计入可见辅助。
- 延迟后仍逐字复用此前提供的原句，应保持辅助分类。
- 在间隔情境中发送 `ok` 或立即重复上一条回复，应被拒绝，不能推进间隔。
- 回复 `I don't know how to express gratitude for the book.`，不得因提到了表达就获得自主产出证据。
- 回复 `Thank you so much for finding my book.`，系统可以记录“未观察到计划的目标表达”，但不能据此宣称该替代表达不是有效英语或证明用户不会表达。

## 受控阅读与 DeepSeek

完成主闭环后打开 Reading room。配置密钥时创建阅读，并检查词汇验证面板：应能查看允许词、目标表达、人名、意外词汇和每次尝试。通过验证的模型草稿可以直接使用；不合格草稿必须被合格的原创模板替换，并记录为 `original-template`。仅阅读不能产生自主产出证据；理解题只能产生较弱的理解证据，同一篇不能反复提交。

执行上面的 `npm run check:provider` 可用合成状态独立检查连通性，不写入档案。这会使用 `.env.local` 发起一次真实请求。`providerReached: true` 说明获得了响应；`draftPassed` 和 `deliveredSource` 用于区分可直接采用的模型草稿与通过验证的模板回退。“已配置”标签本身不代表连接成功。

`npm test` 和 `npm run typecheck` 涵盖自动化检查，包括异常响应、接口错误、超时、词义歧义、状态保留、学习者隔离及过期版本写入保护。

## 尚未完成的验收

教过的表达目前只在两个回忆领域间循环，而稳定阶段需要三个领域、两个会话和七天。合成稳定示例与规则单元测试不能替代缺失的完整路径。补齐情境和全流程测试前，应将稳定路径验收记为待完成。多日学习效果和响应式浏览器验收也需明确记录，不能从单元测试通过推断。

请记录执行日期、浏览器与视口、初始档案、通过步骤、失败情况及观察到的证据。本次已重新运行自动化引擎场景，但尚未完整执行本指南的浏览器操作序列。
