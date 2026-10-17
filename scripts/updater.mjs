import yaml from 'yaml'
import { writeFileSync } from 'fs'
import {
  getProcessedVersion,
  isDevBuild,
  getDownloadUrl,
  generateDownloadLinksMarkdown
} from './version-utils.mjs'
import { resolveChangelog } from './changelog.mjs'

// 修改记录默认由 commit 动态生成；需要手写时设置 CHANGELOG_SOURCE=file
const version = getProcessedVersion()
const isDev = isDevBuild()
const downloadUrl = getDownloadUrl(isDev, version)
const notesPath = process.env.RELEASE_NOTES_PATH || 'release-notes.md'

const { markdown: changelog, source, commits } = resolveChangelog({ version })

const latest = {
  version,
  changelog
}

let notes = changelog
notes += generateDownloadLinksMarkdown(downloadUrl, version)
notes +=
  '\n\n### 机场推荐：\n- 高性能海外机场，稳定首选：[https://狗狗加速.com](https://party.dginv.click/#/register?code=ARdo0mXx)'

writeFileSync('latest.yml', yaml.stringify(latest))
writeFileSync(notesPath, notes)

console.log(`[updater] 修改记录来源: ${source}（${commits.length} 个提交）`)
console.log(`[updater] 已生成 latest.yml 与 ${notesPath}`)
