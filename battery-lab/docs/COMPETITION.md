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

切到汽车，运行温和天气，再切冬季例子运行。展示“满电可用 Wh”和取暖需求。明确说明 90% 可用比例与 1 kW 取暖是可调示例，不能称为某车型实测。

**1:35–2:15 — 长期参考实验**

进入 Sandbox，运行 B1 参考电芯默认实验，解释日历和循环损耗。把电芯温度改到 0°C，展示系统拒绝输出超范围寿命数字。说明“我们区分有依据的模拟和没依据的猜测”。

**2:15–2:45 — 验证**

进入 Evidence，展示 100 Wh/10 W、能量守恒和原模型一致性检查。解释这些检查与目标设备长期实测的区别。

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
