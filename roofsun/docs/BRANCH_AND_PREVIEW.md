# 新分支、预览与同步

本分支：`JESON-ROOFTOPJIM`。Git 分支名不能含空格，因此使用连字符。基础为 `Jim's-RoofSun-HK` 的 `427b206`，保留整个 RoofSun 项目；没有合并电池项目代码，没有改写 Jim 分支。

## 这台 Windows 电脑的预览

地址：<http://127.0.0.1:8766/>。这与 `8765` 的电池网站不同。工作区是 `E:\hackathon\jeson-rooftopjim\roofsun`，Python 环境是 `E:\hackathon\roofsun-venv`。

服务关闭后，在 PowerShell 中运行：

```powershell
Set-Location E:\hackathon\jeson-rooftopjim\roofsun
$env:PYTHONUTF8='1'
& E:\hackathon\roofsun-venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8766
```

前端修改后需先重新构建。其他电脑按 README 安装依赖和运行。Jim 的 Cloudflare 链接由其运行中的服务控制，本次推送到新分支不会自动更新那个网站。本地预览不是公共部署。

## 与 Jim 的后续更新同步

本轮已在开发开始和结束前核对 Jim 分支。没有启用后台监控，不会在无人审查时自动合并或覆盖工作。

在本分支工作区，先确保本地修改已正常提交：

```powershell
git fetch origin "Jim's-RoofSun-HK"
git log --oneline --left-right HEAD..."origin/Jim's-RoofSun-HK"
git merge "origin/Jim's-RoofSun-HK"
```

如有冲突，逐项保留双方意图。然后在 `roofsun/` 运行：

```text
python -m pytest -q
python scripts/validate.py
npm run build
```

重启预览服务后，设置 `ROOFSUN_TEST_URL` 指向该服务并运行 `npm run test:browser`、`node scripts/owner-browser-test.mjs`。Windows 可设置 `ROOFSUN_BROWSER_CHANNEL=msedge` 使用已安装的 Edge。通过后正常提交并 `git push origin HEAD:JESON-ROOFTOPJIM`，不要强制推送。

模型/输入变化后，旧验证报告会标为过期；必须重新生成。不能仅修改 `passed`、模型版本或报告时间来“通过”检查。

## 改动边界

- 新增业主问题与结果解释、安装沟通提示、依据充分性表。
- 修复验证结果状态和加载错误显示；增加报告时间、模型/数据指纹及过期状态。
- 导出报告补充通俗决策说明与每个方案的持续回本日期。
- 比赛 requirements/criteria、三分钟脚本、来源分析与提交自查在 `docs/`。
- 无真实用户记录、真实安装报价和现场发电记录；不将这些待开展工作包装成已完成。
