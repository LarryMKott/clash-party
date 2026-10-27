# MEMORY.md - clash-party 长期项目记忆

## 环境坑（每次会话都会遇到，先读这条）

- 本机 git 全局 `core.autocrlf=true`，工作区 CRLF / 仓库 LF。`prettier --list-different`/`format:check` 会把大量未改动文件误判为不合规。校验时用 `tr -d '\r'` 归一化或加 `--end-of-line auto`；CI（Linux/LF）不受影响。
- prettier 在仓库外（如 /tmp）运行读不到 `.prettierrc.yaml`（singleQuote: true），会把 YAML 单引号误报为不合规——只有在仓库内运行才可信。
- pre-commit 钩子（`.githooks/pre-commit` → `scripts/run-pre-commit-checks.mjs`，跑 format/lint/typecheck 三连）在本 clone **未安装**（`git config core.hooksPath` 未设置），所以本地提交从不走检查；`pnpm install` 的 prepare 会装上它，装上后第一次提交必须真过三连。
- 本机无 `gh` CLI，CI 运行状态无法查询；pnpm 不在 PATH，用 `corepack pnpm`（解析到 packageManager 指定的 11.8.0）。
- 测试基线：全量 `vitest run` 有 1 个环境性失败（`src/main/utils/app-info/linux.test.ts` 的 symlink EPERM / safe-delete shim），会留 `.linux-app-test-*` 临时目录需手动清理；`tsconfig.web.json` 有既有 monaco-editor TS2307（本机缺 peer 包）。

## 仓库规约

- AGENTS.md：禁止 `--no-verify` 提交/推送；提交前跑 `format:check && lint:check && typecheck`。
- 用户工作流：极简中文指令（"提交推送"）表达完整流程，AI 自行判断提交边界；发布说明与代码改动分独立提交；发布前打注释 tag。
- 上游是 `mihomo-party-org/clash-party`（remote: upstream），本仓是 fork（LarryMKott/clash-party），分支 `smart_core`，需要定期合并上游。
- IPC 新增 channel 三处都要改：`main/utils/ipc.ts` asyncHandlers、`preload/index.ts` validInvokeChannels（漏了会静默失效）、`renderer/utils/ipc.ts` 接口+解构导出。

## 2026-10-17 CI 修正（本日工作，详见当日日志）

- GitHub Actions 弃用 node20：`pnpm/action-setup@v4`（v4.1.0 仍 node20）→ **v5**；`softprops/action-gh-release@v2`（v2.6.2 最终版）→ **v3**。build.yml 6+12 处、ci.yml 2 处，纯字符串替换，未提交。
- 遗留：`issues.yml` 的 `tibdex/github-app-token@v2`（node20，上游 2023-09 停更）与 `mihomo-party-org/universal-assistant@v1.0.3`（node20，2024-10 停更）无 node24 版本可升，下次触发 issues 工作流时会挂，待用户决策（fork/vendor/放任）。
