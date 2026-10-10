// 从节点名称推断落地地区，供 3D 地球视图定位。
// 识别顺序：emoji 国旗（由 Unicode 区域指示符直接换算 ISO 代码）→ 中英文关键词。
// 纯装饰用途，容忍少量误判。

export interface RegionInfo {
  iso: string
  name: string
  lat: number
  lng: number
}

export const REGIONS: RegionInfo[] = [
  { iso: 'HK', name: '香港', lat: 22.32, lng: 114.17 },
  { iso: 'TW', name: '台湾', lat: 23.7, lng: 120.96 },
  { iso: 'JP', name: '日本', lat: 36.2, lng: 138.25 },
  { iso: 'KR', name: '韩国', lat: 36.5, lng: 127.8 },
  { iso: 'SG', name: '新加坡', lat: 1.35, lng: 103.82 },
  { iso: 'MY', name: '马来西亚', lat: 4.21, lng: 101.98 },
  { iso: 'TH', name: '泰国', lat: 15.9, lng: 100.99 },
  { iso: 'VN', name: '越南', lat: 14.06, lng: 108.28 },
  { iso: 'PH', name: '菲律宾', lat: 12.88, lng: 121.77 },
  { iso: 'ID', name: '印尼', lat: -2.55, lng: 118.02 },
  { iso: 'IN', name: '印度', lat: 20.59, lng: 78.96 },
  { iso: 'AE', name: '阿联酋', lat: 23.42, lng: 53.85 },
  { iso: 'TR', name: '土耳其', lat: 38.96, lng: 35.24 },
  { iso: 'US', name: '美国', lat: 39.83, lng: -98.58 },
  { iso: 'CA', name: '加拿大', lat: 56.13, lng: -106.35 },
  { iso: 'BR', name: '巴西', lat: -14.24, lng: -51.93 },
  { iso: 'AR', name: '阿根廷', lat: -38.42, lng: -63.62 },
  { iso: 'GB', name: '英国', lat: 54.0, lng: -2.0 },
  { iso: 'DE', name: '德国', lat: 51.17, lng: 10.45 },
  { iso: 'FR', name: '法国', lat: 46.6, lng: 2.22 },
  { iso: 'NL', name: '荷兰', lat: 52.13, lng: 5.29 },
  { iso: 'RU', name: '俄罗斯', lat: 61.52, lng: 105.32 },
  { iso: 'AU', name: '澳大利亚', lat: -25.27, lng: 133.78 }
]

const REGION_BY_ISO = new Map(REGIONS.map((r) => [r.iso, r]))

// 已知 ISO 国家码 → 地区坐标（战争桌面按连接目的地国家码直接定位）
export function getRegionByIso(iso: string): RegionInfo | undefined {
  return REGION_BY_ISO.get(iso.toUpperCase())
}

// 关键词按此顺序短路匹配；短代码用 \b 防止误命中（如 US 匹配到 RUSSIA）
const REGION_KEYWORDS: [string, RegExp][] = [
  ['HK', /香港|港區?节点|Hong ?Kong|\bHK\b/i],
  ['TW', /台湾|臺灣|台北|臺北|新北|彰化|Taiwan|\bTW\b/i],
  ['JP', /日本|东京|東京|大阪|埼玉|Japan|Tokyo|Osaka|\bJP\b/i],
  ['KR', /韩国|韓國|首尔|首爾|春川|Korea|Seoul|\bKR\b/i],
  ['SG', /新加坡|獅城|狮城|Singapore|\bSG\b/i],
  ['MY', /马来西亚|馬來西亞|Malaysia|\bMY\b/i],
  ['TH', /泰国|泰國|Thailand|\bTH\b/i],
  ['VN', /越南|Vietnam|\bVN\b/i],
  ['PH', /菲律宾|菲律賓|Philippines|\bPH\b/i],
  ['ID', /印尼|印度尼西亚|印度尼西亞|Indonesia|\bID\b/i],
  ['IN', /印度|\bIndia\b/i],
  ['AE', /迪拜|杜拜|阿联酋|阿聯酋|Dubai|\bAE\b/i],
  ['TR', /土耳其|Turkey|Türkiye|\bTR\b/i],
  [
    'US',
    /美国|美國|美西|美东|美南|洛杉矶|洛杉磯|圣何塞|聖何塞|西雅图|西雅圖|凤凰城|Unite?d ?States|\bUSA?\b/i
  ],
  ['CA', /加拿大|Canada|\bCA\b/i],
  ['BR', /巴西|Brazil|\bBR\b/i],
  ['AR', /阿根廷|Argentina|\bAR\b/i],
  ['GB', /英国|英國|伦敦|倫敦|\bUK\b|Britain|London|\bGB\b/i],
  ['DE', /德国|德國|法兰克福|法蘭克福|Germany|Frankfurt|\bDE\b/i],
  ['FR', /法国|法國|巴黎|France|Paris|\bFR\b/i],
  ['NL', /荷兰|荷蘭|阿姆斯特丹|Netherlands|Amsterdam|\bNL\b/i],
  ['RU', /俄罗斯|俄羅斯|莫斯科|Russia|Moscow|\bRU\b/i],
  ['AU', /澳大?利亚|澳大?利亞|澳洲|悉尼|Australia|Sydney|\bAUS?\b/i]
]

function isoFromFlagEmoji(name: string): string | null {
  const match = name.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)
  if (!match) return null
  // match[0] 恰好是两个区域指示符码点，逐个换算成 ISO 字母
  const points = Array.from(match[0]).map((c) => c.codePointAt(0) ?? 0)
  if (points.length !== 2) return null
  return String.fromCharCode(points[0] - 0x1f1e6 + 65, points[1] - 0x1f1e6 + 65)
}

export function resolveRegion(name: string): RegionInfo | undefined {
  const iso = isoFromFlagEmoji(name)
  if (iso) {
    const region = REGION_BY_ISO.get(iso)
    if (region) return region
  }
  for (const [isoKey, re] of REGION_KEYWORDS) {
    if (re.test(name)) return REGION_BY_ISO.get(isoKey)
  }
  return undefined
}
