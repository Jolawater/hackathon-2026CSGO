# TankWise（Andy 分支）—— 可运行的小物理模型 + 展示 demo

> HacKU 2026 · Problem 3「Test the Change Before You Make It」
> 题目方向：*Hot water for a small flat: tank volume against heater power —
> a longer shower against the space, the weight and the standing loss the tank costs.*
>
> 本分支基于 main 的[团队方案书](https://github.com/Jolawater/hackathon-2026CSGO/blob/main/HacKU_P3_团队方案书1656.docx)（v1.0，Jim）
> 与 [Ricky 的方案拷问](https://github.com/Jolawater/hackathon-2026CSGO/blob/Ricky/PS3_热水器方案拷问.md)实现，
> 是**第一个可运行版本**：N 层分层水箱模型 + 边界模型解析解 + 晚间场景引擎 + 演示页。

## 快速开始（Python 3.10+）

```bash
pip install -r requirements.txt        # 只有 numpy 一个依赖
python -m tankwise.demo                # CLI 演示 + 生成 demo.html
python -m unittest discover -s tests -v   # 14 个校验测试
```

`demo.html` 是自包含展示页（已内嵌全部模拟数据），**双击即可在浏览器打开**，
无需服务器。也可随时用 `python -m tankwise.demo` 重新生成。

## 结构

```
tankwise/
  physics.py    常数 + 混水计算 + 两个边界模型的解析解
  tank.py       N 层分层水箱模型（加热/散热/用水/浮力/恒温器，能量记账）
  scenario.py   晚间场景引擎（冷缸加热 → 多人洗澡 → 间隔恢复）
  demo.py       CLI 演示 + 生成 demo.html
tests/test_model.py   14 个校验测试
```

## 模型一句话

水箱竖直分成 N 个等体积层（每层完全混合）；每步依次：**加热（底部元件）→
待机散热 → 用水（顶部出水、底部补冷水、上风格式）→ 浮力修正（逆温层混合）→
恒温器（顶部传感器 + 回差）**。N = 1 退化为完全混合模型，N → ∞ 逼近理想分层
上界——两个边界都有解析解，把 N 层模型夹在中间。

## 题目要求对照（Problem 3 SCOPE + EVIDENCE）

| 题目要求 | 本分支 |
|---|---|
| 一个小系统 | 储水式电热水器 + 花洒（一家人的晚间洗澡） |
| ≥ 2 个可调输入 | 容量、设定温度、分层数 N、入水温度（demo 可选 15/27°C）等 7 项 |
| 1 个实际约束 | 设定温度 ≥ 60°C（军团菌控制，香港守则）；3 kW 功率上限；空间/承重 |
| 两个结果的取舍 | 单人可洗分钟数 **vs** 空间 + 满水重量（待机电费为次要输出，见拷问 §3） |
| 对照已知关系/参考案例 | 能量守恒 < 1%（实测 1e-13%）；解析解（4.245 / 8.333 分钟）；消委会 2018 四组实测全部落在两个边界之间 |
| 比较 ≥ 2 配置并说明选择 | 25 L/65°C vs 38 L/60°C：选 38 L/60°C（余量、电费、等待全面占优，代价是 +13 kg 与空间） |
| 标注模拟、列出忽略效应 | CLI 与 demo.html 均有 SIMULATED 标注与忽略效应清单 |

## 已知差异（诚实记录，不强行拟合）

- **消委会实测加热时间比整缸能量计算快 20–30%**（18 L：实测 15 分钟 vs 计算
  20.9 分钟）。候选原因：恒温器在传感器位置达到设定值时停机、底部未热透；
  “加热时间”的定义差异；初始分层。待数据组读报告原文后解释（方案书 §5.3）。
- **UA = 0.5 W/K、电价 HK$1.40/kWh、环境 22°C 均为待核实的假设**。
  数据源应换成 data.gov.hk 的 `meels_stewh.csv`（333 款，拷问 §2.1）。

## 下一步（对齐方案书阶段 1–2）

1. 数据组（B）：EMSD `meels_stewh.csv`、消委会 2018 四组完整数据、CLP 电价表入 `data/`；
2. 模型组（A）：按消委会数据标定混合参数 ε（进水混入底部 ε·V，花洒式/非开口式各一个，
   拷问 §2.5）；Courant 数恒为 1 的可变步长；
3. 前端（C）：把 demo.html 升级为 Streamlit 页面（滑杆实时计算，方案书 §6.1）。

## 免责

本分支所有数字均为**模拟**或**待核实假设**，不构成购买建议。
