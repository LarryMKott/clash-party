import { execSync } from 'child_process'
import { readFileSync } from 'fs'

// 获取Git commit hash
export function getGitCommitHash(short = true) {
  try {
    const command = short ? 'git rev-parse --short HEAD' : 'git rev-parse HEAD'
    return execSync(command, { encoding: 'utf-8' }).trim()
  } catch (error) {
    console.warn('Failed to get git commit hash:', error.message)
    return 'unknown'
  }
}

// 获取当前月份日期
export function getCurrentMonthDate() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${month}${day}`
}

// 从发布 tag 解析版本号：fork 自己维护补丁号，tag、package.json、产物名、latest.yml 同源。
// 只接受 vX.Y.Z，带后缀的旧 tag（v2.0.3-fork.8）不参与版本推导。
export function normalizeTagVersion(ref) {
  const match = /^v(\d+\.\d+\.\d+)$/.exec((ref || '').trim())
  return match ? match[1] : ''
}

// 从package.json读取基础版本号
export function getBaseVersion() {
  try {
    const pkg = readFileSync('package.json', 'utf-8')
    const { version } = JSON.parse(pkg)
    // 移除dev版本格式后缀
    return version.replace(/-d\d{2,4}\.[a-f0-9]{7}$/, '')
  } catch (error) {
    console.error('Failed to read package.json:', error.message)
    return '1.0.0'
  }
}

// 正式版版本号：优先取发布 tag，本地构建回退 package.json
export function getReleaseVersion() {
  return normalizeTagVersion(process.env.GITHUB_REF_NAME) || getBaseVersion()
}

// 生成dev版本号
export function getDevVersion() {
  const baseVersion = getBaseVersion()
  const monthDate = getCurrentMonthDate()
  const commitHash = getGitCommitHash(true)

  return `${baseVersion}-d${monthDate}.${commitHash}`
}

// 检查当前环境是否为dev构建
export function isDevBuild() {
  return (
    process.env.NODE_ENV === 'development' ||
    process.argv.includes('--dev') ||
    process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
  )
}

// 获取处理后的版本号
export function getProcessedVersion() {
  if (isDevBuild()) {
    return getDevVersion()
  } else {
    return getReleaseVersion()
  }
}

// 生成下载URL：fork/自建仓库时指向 GITHUB_REPOSITORY，未注入时回退上游。
// 正式版 tag 与版本号一致（v2.0.4），链接直接来自 tag。
export function getDownloadUrl(isDev, version) {
  const repo = process.env.GITHUB_REPOSITORY || 'mihomo-party-org/clash-party'
  const base = `https://github.com/${repo}/releases/download`
  if (isDev) {
    return `${base}/dev`
  }
  const ref = process.env.GITHUB_REF_NAME || ''
  const tag = ref.startsWith('v') ? ref : `v${version}`
  return `${base}/${tag}`
}

// 下载链接的文件名与 electron-builder artifactName 保持一致（含花火版标识）
export function generateDownloadLinksMarkdown(downloadUrl, version) {
  const fw = 'clash-party-fireworks'
  let links = '\n### 下载地址：\n\n#### Windows10/11：\n\n'
  links += `- 安装版：[64位](${downloadUrl}/${fw}-windows-${version}-x64-setup.exe) | [32位](${downloadUrl}/${fw}-windows-${version}-ia32-setup.exe) | [ARM64](${downloadUrl}/${fw}-windows-${version}-arm64-setup.exe)\n\n`
  links += `- 便携版：[64位](${downloadUrl}/${fw}-windows-${version}-x64-portable.7z) | [32位](${downloadUrl}/${fw}-windows-${version}-ia32-portable.7z) | [ARM64](${downloadUrl}/${fw}-windows-${version}-arm64-portable.7z)\n\n`
  links += '\n#### Windows7/8：\n\n'
  links += `- 安装版：[64位](${downloadUrl}/${fw}-win7-${version}-x64-setup.exe) | [32位](${downloadUrl}/${fw}-win7-${version}-ia32-setup.exe)\n\n`
  links += `- 便携版：[64位](${downloadUrl}/${fw}-win7-${version}-x64-portable.7z) | [32位](${downloadUrl}/${fw}-win7-${version}-ia32-portable.7z)\n\n`
  links += '\n#### macOS 11+：\n\n'
  links += `- PKG：[Intel](${downloadUrl}/${fw}-macos-${version}-x64.pkg) | [Apple Silicon](${downloadUrl}/${fw}-macos-${version}-arm64.pkg)\n\n`
  links += '\n#### macOS 10.15+：\n\n'
  links += `- PKG：[Intel](${downloadUrl}/${fw}-catalina-${version}-x64.pkg) | [Apple Silicon](${downloadUrl}/${fw}-catalina-${version}-arm64.pkg)\n\n`
  links += '\n#### Linux：\n\n'
  links += `- DEB：[64位](${downloadUrl}/${fw}-linux-${version}-amd64.deb) | [ARM64](${downloadUrl}/${fw}-linux-${version}-arm64.deb)\n\n`
  links += `- RPM：[64位](${downloadUrl}/${fw}-linux-${version}-x86_64.rpm) | [ARM64](${downloadUrl}/${fw}-linux-${version}-aarch64.rpm)\n\n`
  links += `- PACMAN：[64位](${downloadUrl}/${fw}-linux-${version}-x64.pkg.tar.zst) | [ARM64](${downloadUrl}/${fw}-linux-${version}-aarch64.pkg.tar.zst)`

  return links
}
