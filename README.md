# NitroClock —— CPU 低温超频决策工具（本分支）

> HacKU 2026 · Problem 3「Test the Change Before You Make It」

本分支是**新方向**：放弃储水式电热水器（TankWise，旧方案书与代码保留在 [`Andy`](https://github.com/Jolawater/hackathon-2026CSGO/tree/Andy) 分支），改做 **CPU 低温超频（干冰/液氮）决策工具**。

## 方案书

- 📄 [NitroClock_团队方案书_v1.0.md](./NitroClock_团队方案书_v1.0.md)（GitHub 在线阅读版，建议以此为准）
- 📝 NitroClock_团队方案书_v1.0.docx（同内容 Word 版，微信群分享用）

## 下一步里程碑（见方案书 §9）

1. **阶段 0（第一天上午）**：全员确认方向与分工；**问清场地是否允许干冰演示**（被拒 → 改为提前录制 + 现场模型演示）
2. **阶段 1**：风冷 bench 探针（验证 ΔT=P·R_θ 与 P∝V²f）+ HWBOT 数据手动采集 ≥30 行
3. **阶段 2**：标定 + 干冰实测闭环（先 commit 预测、后实测）
