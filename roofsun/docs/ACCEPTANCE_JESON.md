# JESON-ROOFTOPJIM 验收记录

2026-10-03，Windows / Python 3.12，独立环境安装 `requirements-lock.txt`；前端通过 `npm ci` 安装。基础分支在开始及推送前均核对为 Jim 的 `427b206`。

| 范围 | 实际执行 | 结果 |
|---|---|---|
| 模型与新增报告指纹检查 | `python -m pytest -q -p no:cacheprovider`，在 `roofsun/` 执行 | 52 项通过 |
| 参考案例与报告生成 | `python scripts/validate.py` | 11 项检查、3 个全年参考案例通过；保存时间和模型/数据 SHA-256 |
| 生产构建 | `npm run build` | 通过 |
| Jim 完整浏览器回归 | `node scripts/browser-test.mjs`，Edge，生产服务器 8766 | 通过：排板、9.9 kW、财务目标、A/B、导入重算、报告、敏感性、测量输入、双语、手机、错误恢复 |
| 新功能浏览器验收 | `node scripts/owner-browser-test.mjs` | 通过：回本/压力解释、来源界限、中文、390 px、合成失败/未知/过期/不可用报告 |
| 运行时验证元数据 | `GET /api/validation` | `freshness.status=current`，11 项 `passed=true` |
| 可视检查 | 中文桌面与 390 px 手机截图 | 检查文本与卡片布局，修正外部留白；无横向溢出 |

失败与过期报告的浏览器输入是测试拦截产生的合成数据，不是伪造现场证据，也没有写入项目验证报告。上述通过只证明相应软件行为及参考关系，不等于真实屋顶产出、保证回本、结构安全或真实用户满意度。

仍未完成且没有宣称完成：用户访谈、现场发电验证、实际安装报价、商业面板参数校准、最终 Pitch Deck、录制演示视频及官方提交。
