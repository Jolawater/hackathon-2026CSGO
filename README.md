# NitroClock —— CPU 低温超频决策工具（本分支）

> HacKU 2026 · Problem 3「Test the Change Before You Make It」

本分支是**新方向**：放弃储水式电热水器（TankWise，旧方案书与代码保留在
[`Andy`](https://github.com/Jolawater/hackathon-2026CSGO/tree/Andy) 分支），
改做 **CPU 低温超频（干冰/液氮）决策工具**。

## 方案书

- 📄 [NitroClock_团队方案书_v1.0.md](./NitroClock_团队方案书_v1.0.md)（GitHub 在线阅读版，以此为准）
- 📝 NitroClock_团队方案书_v1.0.docx（同内容 Word 版，微信群分享用）

## 可运行模型（第一版）

```bash
pip install -r requirements.txt            # 只有 numpy
python -m nitroclock.demo                  # CLI 演示 + 生成 demo.html
python -m unittest discover -s tests -v    # 29 个校验测试
```

`demo.html` 自包含（内嵌全部模拟数据），双击即可在浏览器打开：
选芯片（6 颗示例）/ 拉电压（1.00–2.00 V）/ 改时长与预算 → 推荐大卡
+ 档位条形图（7 档，含热失控/冷 bug 状态灯）+ 对数坐标帕累托前沿 + 配置对比。

### 模型一句话

`P(V,f,T) = P_dyn_ref·(V/V0)²·(f/f0) + 泄漏(T)`，`T_j = T_coolant + R_stack·P`，
`f_max = f0·(V/V0)^p_v·(T_eff/300)^(-p_t)`（T_eff 在 T_floor=-196°C 封顶）——
三者耦合，不动点迭代求解；然后过**两个约束**出可行性，在「档位 × 电压」网格上
画帕累托并按规则推荐。

### 约束（团队决定，只保留两个最重要的）

1. **T_j ≤ Tjmax**（过热）
2. **T_j ≥ T_coldbug**（冷 bug，型号相关；无此参数 = 可下液氮/液氦）

**不建模**（界面与报告均标注）：结露、VRM/供电上限、内存/IMC 瓶颈、
硅彩票个体差异（用区间表达）、设备/耗材价格为占位值。
电压上限 2.00 V；>1.70 V 仅标注电迁移老化风险，不硬限。

### 结构

```
nitroclock/
  physics.py   半导体/制冷剂常数与纯函数（迁移率、Vt、泄漏、P=αCV²f、液氦物性）
  cpus.py      6 颗示例芯片（8核/16核/老旗舰/低压移动/24核工作站/X3D 缓存版）
  cooling.py   7 个散热档位（风冷→液氦，含设备摊销与耗材成本、风险排名）
  model.py     不动点求解 + 两个约束判定 + 决策层（帕累托/推荐/性价比王）
  demo.py      CLI 演示 + 生成 demo.html
tests/test_model.py   29 个校验测试
```

### 已验证（方案书 §6 对应项）

- 已知关系：P ∝ V²f（电压平方、频率线性）、泄漏每 22°C 翻倍、Tj = Tc + R·P（残差 ~1e-12°C）、迁移率理论上限 ×7.7 vs 标定 ×1.18
- 冷 bug 悬崖：DemoCore 16 + 液氮，1.25 V 冷崩、1.70 V 可行——「电压太低反而崩」；X3D 缓存版与液氮/液氦绝缘
- 热失控：风冷/水冷在高电压下泄漏正反馈发散 → 判定过热
- 液氦：结温 -189°C 比液氮 -122°C 更低 → 频率再高 ~7%，成本 297 倍（汽化热只有液氮 1/60）→ 只属于无预算冲纪录
- 决策：预算 HK$100 → 干冰；HK$600 → 液氮；无预算 → 液氦；低温档性价比王 = 干冰

## 下一步里程碑（方案书 §9）

1. **阶段 0（第一天上午）**：全员确认方向与分工；**问清场地是否允许干冰演示**
2. **阶段 1**：风冷 bench 探针（验证 ΔT=P·R_θ 与 P∝V²f）+ HWBOT 数据手动采集 ≥30 行，
   替换本分支全部占位参数（cpus.py / cooling.py 与方案书附录清单）
3. **阶段 2**：标定 + 干冰实测闭环（先 commit 预测、后实测）
