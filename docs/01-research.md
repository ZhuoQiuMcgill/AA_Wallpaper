# AA Leaderboard Wallpaper — 调研与方案（Step 1 & 2）

> *(Chinese) Research notes on the Artificial Analysis API and Wallpaper Engine mechanics, written 2026-09-11. English summary: see `docs/02-data-and-platform-facts.md` headings and the root README.*

> 状态：2026-09-11 调研完成。**两项实测均已完成**：API key 可用（Free 档，100/24h）；WE 内探针证实 CORS 不受限 → 采用**路径 A**（壁纸直接 fetch）。数据定稿见 `02-data-and-platform-facts.md`。
> 目标：把 artificialanalysis.ai 的 leaderboard 做成 Wallpaper Engine 壁纸，每 4 小时自动更新。

---

## 0. 结论摘要

| 问题 | 结论 |
|---|---|
| 数据从哪来 | Artificial Analysis 有**官方免费 Data API**，无需爬网页。`GET https://artificialanalysis.ai/api/v2/language/models/free`，`x-api-key` 头鉴权。 |
| 配额够不够 | Free 档 **100 次 / 24h**。每 4h 刷新一次 = 6 次/天（数据分 2 页则 12 次），余量 8 倍以上。 |
| 壁纸怎么做 | 必须是 **Web 类型壁纸**（HTML/CSS/JS）。Scene 类型无法联网（开发者原话）。本机 WE 2.8.42，内置 CEF = **Chrome 146**，现代前端特性全可用。 |
| 壁纸能否直接 fetch API | **可以**（探针实测：带 `x-api-key` 的预检请求返回可读的 401，CORS 未强制）。 |
| 兜底方案 | 无论探针结果如何都有可行路径：A) 壁纸自己 fetch；B) Windows 计划任务 + PowerShell 每 4h 写 `data.js` 到壁纸目录；C) `config.json` 的 `cefcommandline` 加 `--disable-web-security`。 |
| 需要用户做的 | ① 注册 AA 账号拿免费 API key；② 在 WE 里导入探针壁纸并把屏幕上的结果告诉我；③ 回答 §4 的几个设计决策。 |

---

## 1. 数据获取：Artificial Analysis Data API

### 1.1 基本信息（来源：`/data-api/docs`）

- **Base URL**：`https://artificialanalysis.ai/api/v2`
- **鉴权**：请求头 `x-api-key: <key>`
- **拿 key**：<https://artificialanalysis.ai/api-key-management-redirect>（未登录会先跳登录 → 回到所属组织的 API key 页面；key 属于组织，同组织的 key 共享配额）
- **分档**：

  | Tier | 每 24h 请求数 | 内容 |
  |---|---|---|
  | Free | 100 | `/language/models/free` + 免费档 media 端点：headline 指数、中位性能、输入/输出价格 |
  | Pro | 500 | 全量 evaluation、blended 价格、性能分位数、context window、参数量、模态、许可证 |
  | Commercial | 定制 | Provider 级数据、性能时序 |

- **限流细节**：固定 24h 窗口（非滚动）。每个响应带 `X-RateLimit-Limit / -Remaining / -Reset`；429 带 `Retry-After`。
- **署名要求**（所有档位强制）：*"When you display or share API data, credit Artificial Analysis as the source. A visible byline or footer link is sufficient."* → 壁纸角落放 "Data: Artificial Analysis · artificialanalysis.ai" 即满足。
- **安全提示**：文档写 *"Keep the key server-side. Do not expose it in browsers or mobile apps."* —— 这是针对公开 Web 应用的建议。个人壁纸中 key 只存在本机（WE 用户属性或本地脚本），只要**不把带 key 的壁纸发到 Workshop** 就没问题。
- **旧版 API**：`/api-reference` 页面还有一套更早的文档（`/api/v2/data/llms/models`，声称 1,000 次/天）。实测该端点仍存在（返回 401 而非 404）。拿到 key 后两套都试一下，看哪套配额更大、字段更全。

### 1.2 免费端点响应结构（文档原文样例，逐字）

`GET /api/v2/language/models/free?page=1`（唯一参数 `page`，1-indexed；无排序/过滤参数，**排序需客户端自己做**）

```json
{
  "tier": "free",
  "intelligence_index_version": 4.1,
  "pagination": { "page": 1, "page_size": 200, "total_pages": 2, "has_more": true },
  "data": [
    {
      "id": "36f73aaf-d38a-4b56-a2b3-d04d17186910",
      "name": "gpt-oss-20B (high)",
      "slug": "gpt-oss-20b",
      "release_date": "2025-08-05",
      "model_creator": { "id": "e67e56e3-15cd-43db-b679-da4660a69f41", "name": "OpenAI" },
      "evaluations": {
        "artificial_analysis_intelligence_index": 24.5,
        "artificial_analysis_coding_index": 18.5,
        "artificial_analysis_agentic_index": 27.6
      },
      "artificial_analysis_intelligence_index_cost": {
        "total_cost": 20.69,
        "cost_per_task": { "total_cost": 0.1678 }
      },
      "pricing": {
        "price_1m_input_tokens": 0.06,
        "price_1m_output_tokens": 0.2,
        "price_1m_cache_hit_tokens": 0.015,
        "price_1m_cache_write_tokens": 0.075
      },
      "performance": {
        "median_output_tokens_per_second": 296.47,
        "median_time_to_first_token_seconds": 0.65,
        "median_time_to_first_answer_token_seconds": 7.4,
        "median_end_to_end_response_time_seconds": 9.09
      }
    }
  ]
}
```

数据约定：`null` = 未测/不适用（不是 0）；日期 ISO 8601；字段 snake_case、只弃用不改名。当前 Intelligence Index 版本 v4.3（10 项评测）。

### 1.3 免费档能画什么、不能画什么（直接影响 Step 3 设计）

**能**：
- 三个指数：Intelligence / Coding / Agentic Index → 主榜单（横向条形图，对应 AA 首页的主图）
- 速度：median output tokens/s、TTFT → "最快模型"副榜
- 价格：input / output / cache 每 1M tokens；跑完整个 Intelligence Index 的总成本、每任务成本 → "性价比"散点或副榜
- 厂商名、发布日期 → 分组着色、"本月新模型"标签
- 免费档 media 端点（text-to-image / image-editing / text-to-video 等 Elo 榜）→ 可选副面板

**不能**（Pro 才有）：
- open-weights / 闭源标记、reasoning 模型标记、context window、参数量、各单项 benchmark 分数、厂商 logo/URL
- 变通：本地维护一张小表（creator → 品牌色 / 是否开源）；logo 用本地 SVG 或只用色块+首字母

### 1.4 CORS 实测

```
GET  /api/v2/language/models/free  (Origin: file:// 或 https://example.com)
  → HTTP 401 {"error":"API key is required"}，无任何 Access-Control-* 头
OPTIONS 同 URL（模拟带 x-api-key 的预检）
  → HTTP 204  allow: GET, HEAD, OPTIONS，无任何 Access-Control-* 头
```

结论：**标准浏览器环境下无法从网页直接调用此 API**（预检失败）。能否在 WE 里调用，取决于 WE 的 CEF 是否关闭了 web security，见 §2.4。

---

## 2. Wallpaper Engine Web 壁纸

### 2.1 本机环境

| 项 | 值 |
|---|---|
| WE 安装路径 | `D:\Steam\steamapps\common\wallpaper_engine` |
| WE 版本 | 2.8.42 |
| 内置浏览器 | CEF，`bin/libcef.dll` = **Chrome/146.0.7680.179** |
| 自建壁纸目录 | `D:\Steam\steamapps\common\wallpaper_engine\projects\myprojects\`（目前为空） |
| Web 壁纸全局 FPS 上限 | `config.json` → `"fps": 15`（默认值；影响动画设计，见 §3） |
| 显示器 | 主屏 2560×1440（RTX 5080，Windows 缩放 125%）；另有 1920×1080 ×2、**1080×1920 竖屏** ×1 |
| Windows 侧可用工具 | PowerShell 5.1 / pwsh 7 / Python (anaconda) / Node.js |

### 2.2 壁纸结构与导入

- 一个文件夹：`index.html` + 本地资源（CSS/JS/字体/图片）+ `project.json`。官方要求**所有依赖本地打包**，不要从网上加载（离线/断网时壁纸不能挂）。
- 导入：WE 编辑器 → 把 `index.html` 拖到 **Create Wallpaper** 按钮 → WE 复制整个文件夹到 `projects\myprojects\<name>\`。也可以直接把文件夹放进 `myprojects`。
- 发布：编辑器 → Workshop → Share。（本项目默认**不发布**，因为壁纸/脚本里带 API key。）
- `project.json` 最小示例（参考官方 `defaultprojects/corsair_o_tron`）：

```json
{
  "title": "AA Leaderboard",
  "description": "...",
  "file": "index.html",
  "type": "web",
  "contentrating": "Everyone",
  "preview": "preview.jpg",
  "general": {
    "properties": {
      "apikey": { "order": 0, "text": "Artificial Analysis API key", "type": "textinput", "value": "" }
    },
    "supportsaudioprocessing": false
  }
}
```

### 2.3 运行时 API（壁纸 ↔ WE）

- 用户属性类型：`color`（值为 "r g b" 三个 0–1 浮点）、`slider`、`bool`、`combo`、`textinput`、`file`、`directory`。
- 接收属性：

```js
window.wallpaperPropertyListener = {
  applyUserProperties: function (p) {
    if (p.apikey) { /* p.apikey.value */ }   // 首次加载 + 每次用户改动都会触发，只带变更的属性
  }
};
```

- 调试：WE 设置 → **General** → **CEF devtools port** 填 `8080` → Chrome 打开 `http://localhost:8080` → 选壁纸页面 → 正常 DevTools（每次壁纸重载要回到列表页重选）。
- 本地文件访问规则（开发者原话）：*"web wallpapers are allowed to read local files from the same directory of the index file"*；`--allow-file-access-from-files` 被有意禁用，不会开放壁纸目录之外的文件。XHR 读本地文件时 `status` 为 0 而非 200（file:// 特性）。

### 2.4 网络访问：三条路径

**证据汇总**
1. AA API 无 CORS 头（§1.4）。
2. WE 开发者在 Steam 帖子里说 *"Web wallpapers just use Google Chromium so the same restrictions apply"*，并指引用 **CEF command line** 参数解除限制。
3. `bin/wallpaperui.exe`（与 `libcef.dll` 同目录，推断为 CEF 宿主进程）内嵌的启动开关列表：`disable-extensions, use-angle, disable-default-apps, disable-sync, disable-gpu-shader-disk-cache, **disable-web-security**, no-user-gesture-required, autoplay-policy, disable-features=IsolateOrigins,site-per-process,...`。紧邻的字符串 `wpxSimulateMouseClick` 是壁纸层才需要的功能，暗示这组开关就是给 web 壁纸用的。
4. `config.json` 有用户可配置字段 `"cefcommandline": ""`，社区已验证可注入 Chromium 开关（例：`--enable-experimental-web-platform-features`）。

2 与 3 矛盾，**只能实测**。探针壁纸见 `shared/we/probe/`。

**路径 A — 壁纸自己 fetch（若探针证明 CORS 不受限）** ★ 首选
- 壁纸内 `setInterval` + `localStorage` 存上次拉取时间戳；每分钟检查一次，超过 4h 才真正请求（防止 WE 重启壁纸/切换显示器/唤醒时重复消耗配额）。
- API key 通过 `textinput` 用户属性输入，存在 WE 的项目配置里，不进代码。
- 优点：零外部依赖，一个文件夹搞定。缺点：违背 AA 的"key 不进浏览器"建议（个人使用可接受）。

**路径 B — 本地取数脚本 + 数据文件（CORS 受限时的兜底；也是最"正统"的方案）**
- Windows 计划任务每 4h 运行 PowerShell（`Invoke-RestMethod`，零依赖），拉取 API → 归一化 → 写 `data.js`（内容 `window.AA_DATA = {...}`）到壁纸目录。
- 壁纸通过 `<script src="data.js">` 读取（script 标签不受 CORS 限制，且在壁纸自身目录内），每隔几分钟用带时间戳的新 script 标签重载或直接 `location.reload()`。
- 优点：key 留在脚本里、不进壁纸；壁纸可脱离 key 独立开发（对 Step 3 的美术模型友好）。缺点：多一个计划任务。

**路径 C — `cefcommandline` 加 `--disable-web-security`**
- 全局生效，会降低所有 Workshop web 壁纸的安全边界。只在 A 失败且不想用 B 时考虑。

**无论 A/B，渲染层与取数层解耦**：渲染层只认一个固定的 `AA_DATA` 结构（见 §3.3），取数层负责把 API 响应归一化成它。这样 Step 3 的美术模型拿一份真实数据的 fixture 就能开工。

### 2.5 "每 4 小时"的实现细节
- WE 会在全屏应用、其他窗口聚焦（若设置）时**暂停**壁纸，CEF 定时器可能被节流 → 不要依赖精确的 `setInterval(…, 4h)`，用"高频检查 + 时间戳比较"。
- 路径 B 下计划任务触发器：每 4 小时，"错过后尽快运行"，唤醒不触发（避免吵醒）。

---

## 3. 显示 Contract
已由 `02-data-and-platform-facts.md` §C 的纯事实版取代（本节原有的设计取向性内容已删除：视觉/交互如何做由美术专家决定，本项目只提供数据与平台事实）。

---

## 4. 决策状态
1. ~~拿 key~~ 已完成（`.env`，Free 档）。
2. ~~跑探针~~ 已完成，CORS 不受限 → 路径 A。
3. ~~屏幕范围~~ 只做主屏 2560×1440。
4. 桌面图标位置 —— 未提供（作为事实写入 02 §C5 供美术专家参考）。
5. 展示内容、版式、动效 —— 属于美术专家（gpt astra），本项目不给意见；输入材料 = `02-data-and-platform-facts.md` + `data/fixtures/aa-data.sample.js`。
6. 是否发布 Workshop —— 未定（影响 key 存放与第三方 logo 使用）。

---

## 附录：来源
- AA Data API 文档：https://artificialanalysis.ai/data-api/docs
- AA 旧版 API 参考：https://artificialanalysis.ai/api-reference
- AA API key 管理：https://artificialanalysis.ai/api-key-management-redirect
- WE Web 壁纸文档：https://docs.wallpaperengine.io/en/web/overview.html
  - 入门：https://docs.wallpaperengine.io/en/web/first/gettingstarted.html
  - 用户属性：https://docs.wallpaperengine.io/en/web/customization/properties.html
  - 调试：https://docs.wallpaperengine.io/en/web/debug/debug.html
  - FPS：https://docs.wallpaperengine.io/en/web/performance/fps.html
- Steam 讨论（开发者回复）：
  - Scene 壁纸不能联网：https://steamcommunity.com/app/431960/discussions/1/3716062344555897591/
  - 本地文件访问规则：https://steamcommunity.com/app/431960/discussions/0/144512753469915486/
  - 目录外文件被禁：https://steamcommunity.com/app/431960/discussions/1/3048356136502134234/
  - "同样的 Chromium 限制适用 / CEF command line"：https://steamcommunity.com/app/431960/discussions/1/3052861185486333664/
  - `cefcommandline` 用法：https://steamcommunity.com/app/431960/discussions/1/1745646586329481684/
