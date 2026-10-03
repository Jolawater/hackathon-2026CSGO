# HacKU 2026 delivery and demonstration

## Mandatory requirements

| Requirement | Implementation / evidence |
|---|---|
| Small physical system | Battery + load + charger, used in three everyday contexts |
| Two adjustable inputs | SOC limits, charging power, load schedule, windows, winter assumptions |
| Practical constraint | Task energy, departure deadline and reserve SOC |
| Conflicting outcomes | More departure energy can require more charging time and cost |
| Check against known relationship/reference | Executable conservation and hand-calculation checks; upstream model reproduction |
| At least two configurations and a choice | A/B selector, candidate table, feasible Pareto frontier and priority-based recommendation |
| Simulated results and omissions identified | Labels throughout UI, source registry and MODEL.md |

The battery energy/charging system is the core project. Reference-cell aging is an additional evidence-limited experiment. The team should demonstrate one strong phone scenario first, then extend to mobility and winter rather than attempting to explain every control in three minutes.

## Exhibition judging: six criteria, five points each

| Criterion | What to show | Remaining human work |
|---|---|---|
| Problem and user needs | A user who cannot charge during the day still needs navigation/contact reserve | Conduct and record actual interviews |
| Human-centered design | User sets needs and constraints before optimization; bilingual interface | Observe users completing an A/B task |
| Technical implementation | Energy accounting, event scheduling, model gate, tests | Team members should explain each equation |
| Prototype/demo | Local, reproducible browser workflow; export/import | Rehearse with intended presentation machine |
| Innovation | Personalized constraint-aware trade-offs and evidence boundary visibility | Avoid claiming invention of the aging model |
| Practicality/impact | Tasks completed, charge time, energy cost, winter sensitivity | Quantify measured benefit only after real testing |

## Pitch judging: six criteria, five points each

1. **Problem framing:** A universal charging rule ignores a student's timetable, a rider's shift and a driver's winter heating needs.
2. **Market/competition:** Compare with manufacturer charging controls, vehicle range estimates and technical battery-model libraries. This prototype adds an interactive pre-change task comparison; it does not replace BMS control. Do not claim competitors lack features without checking them.
3. **Value:** Users see whether their day still works before sacrificing usable energy for a charging habit.
4. **Innovation/differentiation:** Make constraints, alternative strategies and evidence limits visible together.
5. **Delivery:** Demonstrate a working local system and repeatable exported scenario.
6. **Impact/feasibility/future:** Next step is target-device measurement and user trials; not a claim that the prototype already extends lifespan by a measured percentage.

## Three-minute demonstration script / 三分钟演示

**0:00–0:25 — 人与问题**

“每天都充到 80% 适合所有人吗？如果一个学生白天没有插座，晚上还要导航回家，首先要保证这一天能完成。”

**0:25–1:05 — 输入、约束、取舍**

打开手机默认场景。指出备用电量 10%、充电窗口和使用时段。运行 Compare，在 B 下拉中选择 100% 目标，与 90% 对比。解释多出来的出发备用电量需要更多充电时间；80% 方案若越过备用约束，不会被推荐。

**1:05–1:35 — 冬天与可用能量**

切到电车，运行温和天气，再切冬季例子运行。展示“满电可用 Wh”和取暖需求。说明低温能量来自 P28A 厂商曲线的参考迁移，1 kW 取暖仍是用户假设，不能称为某车型实测。

**1:35–2:15 — 长期参考实验**

进入 Sandbox，拖动插头连接手机，快进一天并拖回中午，展示当时电量和估算温度。展开下方 B1 参考电芯实验，展示 EFC—容量图和循环里程碑；说明插电次数不等于完整循环。把电芯温度改到 0°C，展示系统拒绝输出超范围寿命数字。说明“我们区分有依据的模拟和没依据的猜测”。

**2:15–2:45 — 验证**

点页脚 Principles，展示 100 Wh/10 W、能量守恒和原模型一致性检查。解释这些检查与目标设备长期实测的区别。

**2:45–3:00 — 收尾**

“先满足人的任务，再让每个取舍可见。下一步收集具体设备的耗电和容量测量，把参考实验推进到设备校准。”

## Pitch outline / 路演提纲

1. User story and unmet need.
2. Three personas and constraints (mark hypotheses pending interviews).
3. Live A/B result with a genuine trade-off.
4. Model architecture and evidence ladder.
5. Winter and aging examples, including rejected unsupported conditions.
6. Current prototype, measured validation status, future data and user tests.

## User interviews — pending, not conducted

Record participant consent, date, broad user role and anonymized answers. Do not store names or account identifiers in the repository.

1. In the last week, when did low battery disrupt something you needed to do?
2. When can you realistically charge, and how often does that schedule change?
3. What minimum reserve helps you feel able to complete your day?
4. Would you accept another charging stop for lower modeled cell wear? What would make it unacceptable?
5. Can you use the prototype to identify which of two options meets your task? Explain the trade-off in your own words.
6. Do you understand which numbers are assumptions, simulated outcomes and device measurements?

Record task completion, misunderstandings, preferred wording and concrete design changes. Blank interview rows remain blank; there are no fabricated quotes or validation percentages.

## Submission checklist

- Public GitHub branch with source, pinned dependencies, citations and setup instructions.
- Working local demo; competition submission still needs the team to provide the accepted live-demo/video format.
- Three-minute recording can follow the script above; no video is claimed to be recorded here.
- Pitch content outline is provided; team assembles its final deck and delivery.
- Credit AI assistance and BLAST-Lite; teammates should be able to explain architecture and limitations.
- Keep commits within event rules and preserve teammate branches.

## 展示补充：从生活问题进入模拟

先选择一张场景卡，用它说明谁遇到什么问题、需要看哪些结果。建议先演示“学生上课与通勤”，再切换“旅行与长时间外出”，展示相同容量在更高负载下可能不够用；再演示“电单车日常上下班 / 外卖配送”或“电车日常通勤 / 冬季出行”。切换后需重新运行。所有人群描述仍是假设，不能把场景数量当成用户访谈数量。

## 最终 trade-off

主线：任务完成、备用电量 ↔ 充电时间、补电次数与费用。次线：参考电芯容量保持率 ↔ 时间、SOC 与循环条件。热成像视图说明模型估算的热变化，不是实测；湿度只记录，不制造没有依据的寿命系数。3D 可视化服务于解释选择，不能替代验证。

## 2026-10-03：按原始比赛文件复核新增功能

依据：用户提供的《HacKU 2026 — Problem Statements》第 7–8 页，以及《Official Participant Handbook》第 8、10–14 页。题目总编号 3，标题为 **Test the Change Before You Make It**。第 8 页明确将 battery / backup supply 列为可选方向，提出容量、负载、备用时长、成本、充电时间和携带重量的取舍。因此电池系统与本题直接相关。

| 用户要求 | 与比赛的关系 | 展示时怎样使用 |
|---|---|---|
| 手机、电单车、电车及六种生活场景 | 对应 Problem & User Needs、Human-Centered Design | 主讲一种真实需求，其余作为扩展；预设不能冒充访谈 |
| 滑块与数字框、解释图表 | 对应易用性、包容性与清晰演示 | 让不了解物理的人也能解释 A/B 的收益和代价 |
| 充电上限、时间、功率与任务负载 | 直接满足至少两个可调输入 | 固定其他条件，只改策略，公平比较 |
| 出发截止、充电窗口、最低备用量 | 直接满足至少一个现实约束 | 给出不够用案例，解释怎样才能变得可行 |
| A/B 对比与推荐理由 | 题目明确要求 | 必须指出选哪个、为什么，以及为此接受什么代价 |
| 24 小时时间线、快进与回看 | 支持用户探索变化，强化 Prototype & Demonstration | 拖回电量不足的时刻，定位负载和充电机会 |
| 3D 手机、插头拖拽 | 支持体验与展示；不是题目硬性要求 | 用操作帮助解释充电安排，避免只展示视觉效果 |
| 冬季参考数据 | 支持 Technical Implementation 和模型依据 | 展示来源、测试条件、参考迁移与设备实测的区别 |
| 热像示意 | 辅助理解发热；热参数目前尚未设备校准 | 只能说估算温度，不说真实检测、热安全验证 |
| 湿度、家具、黑色背景 | 场景与视觉辅助，和核心取舍关系较弱 | 少占讲解时间；湿度不产生无依据的能量/寿命系数 |
| 循环次数—容量图 | 与长期使用决策相关，是扩展成果 | 展示参考电芯曲线、日历老化和适用范围，不宣称手机准确寿命 |
| Principles 放到页脚 | 合理的界面取舍，不违反题目 | 数据出处和模型限制仍须可找到；演示时主动点开一次 |

### 可复现的主 trade-off

同一部演示手机：15 Wh，起始 20%，输入功率 10 W，效率 90%，80% 后功率减半；00:00–04:00 可充，04:00 出发，08:00–18:00 使用 1 W，备用线 10%。模型中的功率和降速曲线是公开标注的假设。

| 配置 | 出发电量 | 充电时间 | 日末电量 | 是否满足任务与备用线 |
|---|---:|---:|---:|---|
| A：充至 80% | 80% | 约 60 分钟 | 约 13.3% | 是 |
| B：充至 100% | 100% | 约 100 分钟 | 约 33.3% | 是 |

同等容量、功率、初始电量和任务下，B 多得到 3 Wh 的备用能量，同时多花约 40 分钟充电。这才是本次展示明确的收益与代价。优先少充电且日程稳定时可选 A；需要临时外出余量时选 B。不能只说 B 的电量更多，所以它在所有方面都更好。手机上的电费差异很小，不宜夸大省钱收益。

### 已满足与尚待补齐

- 原型已覆盖小系统、多输入、现实约束、冲突结果、A/B 选择、已知物理关系检查、来源与省略因素。
- 展示评分是六项各 5 分：用户需求、人本设计、技术实现、原型展示、创新、实际影响。3D 只支持其中部分表现，没有单独的“3D 加分项”。
- 真实用户验证仍待完成；不能据此宣称已达到用户洞察的最高评分标准。建议由团队让目标用户完成选方案任务，记录是否理解、为何选择及遇到的困难。
- 路演还需讲清现有替代方案、差异、价值、可行性与后续验证。使用公开模型并不等于原创电池化学研究。
- 手册第 8 页要求公开仓库、公开可看的 live demo 或三分钟演示视频，以及 Pitch Deck。本地 `127.0.0.1` 地址不是公开演示链接；GitHub 源码也不等于已部署网站。本轮代码更新不等于完成视频、最终幻灯片或官方提交表。
- 按提供的手册，截止与代码冻结时间为 2026-10-04 13:00（香港时间）；团队应核对主办方后续通知。此处按提供的文件复核，不代表主办方评分或资格认定。

### 地区与月份扩展

赤道附近、香港、高纬度地区的月均环境对照可用于说明相同策略为什么在不同条件下表现不同，支持技术依据与情境理解。地区本身不是直接的电池寿命变量；纬度不直接扣电。树叶、雪花和浅色主题属于交互与展示，不能作为实验验证。演示应先完成核心 A/B 取舍，再用地区作为一个扩展对照。

## 2026-10-03：购买前定位的审查

最新需求是帮助用户判断设备是否适合自己的工作和通勤。建议以同一人的一周、两种候选设备、可行性与价格/补电负担为展示主线。见 [数据与购买决策审查](EVIDENCE_AND_PURCHASE.md)，含逐项数据充分性判断、NIU 条件算例、BYD 地区版本注意事项和新的三分钟演示建议。

原有充电习惯脚本仍可用于已实现的界面。品牌购买比较当前是经来源核对的设计与条件算例，尚未实现跨车型 UI，不能在演示中声称已完成。12 个需求预设已足以展示广度；下一步优先补实际车型参数、同任务候选比较和独立测量，减少重复增加场景。
