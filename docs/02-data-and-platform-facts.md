# AA Leaderboard Wallpaper — 数据与平台事实（v2，纯事实）

> *(Chinese) Facts-only reference: A. what data the AA API provides, B. the shape the data layer delivers (`window.AA_DATA` / events), C. what Wallpaper Engine accepts (files, project.json, JS API, runtime facts from the probe).*

> 日期：2026-09-11。所有数字来自真实 API 响应（647 个语言模型、2 个 media arena）和 Wallpaper Engine 内的探针实测。
> 本文只回答三个问题：**A. 什么数据可以被获取；B. 以什么形式返回；C. Wallpaper Engine 接受什么格式/样式**。不包含任何视觉或交互设计意见。
> 配套：`data/aa/language/cosmos-data.json`（真实数据导出，含 B 节字段）、`data/aa/*/raw/*.json`（原始响应）。

---

## A. 什么数据可以被获取

### A1. 数据源
- Artificial Analysis 官方 Data API：`https://artificialanalysis.ai/api/v2`，鉴权头 `x-api-key`。文档：<https://artificialanalysis.ai/data-api/docs>
- 账号档位 Free。配额 **100 次请求 / 24 小时固定窗口**（响应头 `X-RateLimit-Limit: 100` 实测）。
- 壁纸刷新周期 4 小时（用户设定）。每次刷新的请求数见 B3；总用量约 26 次/天。
- **数据提供方的强制要求**（文档原文，适用所有档位）："When you display or share API data, credit Artificial Analysis as the source. A visible byline or footer link is sufficient." 取数层在 `AA_DATA.attribution` 里给出文案 `Data: Artificial Analysis · artificialanalysis.ai`。
- Intelligence Index 当前版本 **4.3**（由 10 项评测组成）。AA 说明：大版本变更时分数不可跨版本比较；版本号随数据返回。

### A2. 语言模型（主数据）
端点 `GET /language/models/free?page=1..4`（每页 200，共 647 条，**返回顺序无规律**）。每条记录的原始字段（文档样例逐字）：

```json
{
  "id": "36f73aaf-d38a-4b56-a2b3-d04d17186910",
  "name": "gpt-oss-20B (high)",
  "slug": "gpt-oss-20b",
  "release_date": "2025-08-05",
  "model_creator": { "id": "e67e56e3-…", "name": "OpenAI" },
  "evaluations": {
    "artificial_analysis_intelligence_index": 24.5,
    "artificial_analysis_coding_index": 18.5,
    "artificial_analysis_agentic_index": 27.6
  },
  "artificial_analysis_intelligence_index_cost": { "total_cost": 20.69, "cost_per_task": { "total_cost": 0.1678 } },
  "pricing": { "price_1m_input_tokens": 0.06, "price_1m_output_tokens": 0.2,
               "price_1m_cache_hit_tokens": 0.015, "price_1m_cache_write_tokens": 0.075 },
  "performance": { "median_output_tokens_per_second": 296.47, "median_time_to_first_token_seconds": 0.65,
                   "median_time_to_first_answer_token_seconds": 7.4, "median_end_to_end_response_time_seconds": 9.09 }
}
```

字段含义与实测统计（647 条）：

| 字段 | 含义 | 单位 | 非空 | 实测范围 | 中位数 |
|---|---|---|---|---|---|
| `artificial_analysis_intelligence_index` | AA 智能指数 | 分 | 638 (99%) | 3.8 – 53.4 | 11.5 |
| `artificial_analysis_coding_index` | AA 编程指数 | 分 | 257 (40%) | 0 – 81.6 | 44.6 |
| `artificial_analysis_agentic_index` | AA 智能体指数 | 分 | 154 (24%) | 0.1 – 58.0 | 25.1 |
| `median_output_tokens_per_second` | 输出速度中位数 | tokens/s | 331 (51%) | 3.05 – 1411.9 | 85.3 |
| `median_time_to_first_token_seconds` | 首 token 时延中位数 | 秒 | 331 (51%) | 0.31 – 323.3 | 2.38 |
| `median_time_to_first_answer_token_seconds` | 首个答案 token 时延（含思考） | 秒 | 331 (51%) | 0.31 – 323.3 | 10.3 |
| `median_end_to_end_response_time_seconds` | 端到端时延（按 500 输出 token） | 秒 | 331 (51%) | 0.97 – 332.5 | 16.9 |
| `price_1m_input_tokens` | 输入价格 | USD / 1M tokens | 438 (68%) | 0 – 150 | 0.445 |
| `price_1m_output_tokens` | 输出价格 | USD / 1M tokens | 438 (68%) | 0 – 600 | 2.25 |
| `price_1m_cache_hit_tokens` | 缓存命中价格 | USD / 1M tokens | 249 (38%) | 0 – 8.25 | 0.19 |
| `price_1m_cache_write_tokens` | 缓存写入价格 | USD / 1M tokens | 80 (12%) | 0.25 – 18.75 | 3.75 |
| `cost_per_task.total_cost` | 跑 Intelligence Index 的每任务成本 | USD | 137 (21%) | 0 – 8.75 | 0.475 |
| `total_cost` | 跑完整个 Intelligence Index 的总成本 | USD | 137 (21%) | 0 – 13128.9 | 760.8 |
| `release_date` | 发布日期 | YYYY-MM-DD | 647 (100%) | 2022-11-30 – 2026-09-11 | — |
| `model_creator.name` | 厂商 | 文本 | 647 | 59 个不同值 | — |
| `name` | 模型全名 | 文本 | 647 | 长度 ≤ 70，95 分位 46 | — |

AA 数据约定：`null` = 未测量或不适用，**不是 0**；价格为 0 的记录存在（25 条，免费/开源权重）。

**命名事实**：模型名末尾常带括号变体。括号内容统计（647 条）：`Non-reasoning` 90、`Reasoning` 87、`high` 30、`medium` 21、`low` 20、`xhigh` 19、`max` 8、`minimal` 4、`Adaptive Reasoning, Max Effort` 6、`Dec '24` / `Sep '24`（日期版本）等。453 个家族（去掉括号后的名字）中 128 个有多个变体，最多 6 个（如 GPT-6 Astra: max / xhigh / high / medium / low / Non-reasoning）。

不去重时按 Intelligence Index 排序的前 12 名：

```
 1 Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)   Anthropic  53.4
 2 Claude Fable 5.1 (Adaptive Reasoning, Xhigh Effort, Default Fallback) Anthropic  53.2
 3 GPT-6 Astra (max)                                                     OpenAI     52.8
 4 GPT-6 Astra (xhigh)                                                   OpenAI     52.5
 5 Claude Fable 5.1 (Adaptive Reasoning, High Effort, Default Fallback)  Anthropic  51.2
 6 GPT-6 Astra (high)                                                    OpenAI     51.0
 7 Claude Opus 5 (Adaptive Reasoning, Max Effort)                        Anthropic  50.7
 8 Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)    Anthropic  49.7
 9 Claude Opus 5 (Adaptive Reasoning, Xhigh Effort)                      Anthropic  49.7
10 GPT-6 Astra (medium)                                                  OpenAI     49.7
11 Claude Fable 5.1 (Adaptive Reasoning, Medium Effort, Default Fallback) Anthropic 49.1
12 Claude Opus 5 (Adaptive Reasoning, High Effort)                       Anthropic  48.2
```

每家族只保留 Intelligence Index 最高变体后的前 25 名（AA 官网首页大图使用的就是这种口径，前 9 名与其一致）：

```
 #  short_label                     creator    II    coding agentic tps    $in   $out  cost/task release
 1  Claude Fable 5.1 (max)          Anthropic  53.4  81.6   58.0    66.7   10    50    7.63      2026-09-01
 2  GPT-6 Astra (max)               OpenAI     52.8  76.9   51.5    54.4   10    50    3.26      2026-09-03
 3  Claude Opus 5 (max)             Anthropic  50.7  78.0   56.2    51.5   5     25    5.86      2026-07-24
 4  Claude Fable 5 (max)            Anthropic  49.7  76.5   51.0    66.4   10    50    8.75      2026-06-09
 5  Muse Spark 1.3 (max)            Meta       48.2  75.8   55.7    205.9  1.25  4.25  1.60      2026-09-02
 6  GPT-5.6 Sol (max)               OpenAI     47.1  77.4   50.5    59.6   4     20    1.99      2026-07-09
 7  GLM-5.3 (max)                   Z AI       44.9  74.8   53.4    62.4   1.4   4.4   2.01      2026-08-18
 8  Grok 4.6 (high)                 SpaceXAI   44.4  76.8   53.4    55.4   2     6     1.86      2026-08-12
 9  Kimi K3 (max)                   Kimi       43.8  76.2   50.6    38.8   3     15    2.00      2026-07-16
10  GPT-5.6 Terra (max)             OpenAI     42.3  76.7   43.7    87.1   2     12    1.40      2026-07-09
11  Claude Opus 4.8 (max)           Anthropic  42.0  74.3   42.6    57.7   5     25    4.08      2026-05-28
12  GLM-5.3-Flash                   Z AI       41.9  71.5   51.2    94.9   0.15  0.5   0.25      2026-08-26
13  Gemini 3.8 Flash (high)         Google     41.2  76.3   41.1    261.3  0.75  3.75  1.24      2026-09-02
14  Claude Opus 4.7 (max)           Anthropic  40.7  73.6   39.5    43.6   5     25    null      —
15  Qwen3.8 Max                     Alibaba    40.3  71.8   49.6    37.8   —     6     —         —
16  Qwen3.8 2.4T A95B               Alibaba    40.0  71.9   50.4    38.4   —     6     —         —
17  Qwen3.8-Flash-Next              Alibaba    39.9  73.1   53.9    53.8   —     0.47  —         —
18  Muse Spark 1.2 (xhigh)          Meta       39.8  72.2   44.0    186.7  —     4.25  —         —
19  Gemini 3.7 Flash (medium)       Google     39.6  71.5   null    277.2  —     3.75  null      —
20  DeepSeek V4.1 Flash (max)       DeepSeek   39.5  null   null    198.6  —     1.2   —         —
21  Grok 4.5 (high)                 SpaceXAI   39.1  72.4   42.1    54.8   —     6     —         —
22  GPT-5.4 (xhigh)                 OpenAI     39.0  71.1   null    132.2  —     15    null      —
23  GLM-5.2 (max)                   Z AI       38.6  68.8   39.4    66.7   —     4.4   null      —
24  GPT-5.5 (xhigh)                 OpenAI     38.6  74.9   37.3    85.0   —     30    —         —
25  Claude Sonnet 5 (max)           Anthropic  38.4  71.5   44.3    74.2   —     10    —         —
（"—" 为本表省略，"null" 为 API 未测量；完整值见 fixture）
```

去重前 30 名内的实测取值范围：II 35–53.4；coding 62.3–81.6；agentic 37.3–58.0；tps 37.8–277.2；ttft 1.07–323.3 s；e2e 6.27–332.5 s；$in 0.05–10；$out 0.15–50；cost/task 0.18–8.75。前 30 名中 7 个模型缺 coding / agentic / cost_per_task / tps 之一或多项。

**厂商分布**：59 个厂商。全表数量前 10：OpenAI 92、Alibaba 88、Google 65、Anthropic 48、DeepSeek 35、Mistral 32、SpaceXAI 26、Z AI 22、Meta 22、NVIDIA 19。不去重前 50 名：OpenAI 16、Anthropic 14、Google 5、SpaceXAI 4、Meta 3、Z AI 3、Alibaba 3、Kimi 1、DeepSeek 1。

**时间分布**：最近 30 天发布 48 个模型；最新发布日期 2026-09-11。

### A3. 单项 benchmark 分数（旧版端点，可选）
端点 `GET /data/llms/models`（文档 <https://artificialanalysis.ai/api-reference>）。一次请求返回全部 647 条；实测**不扣** A1 的 100 次配额（走独立配额，旧文档称 1,000 次/天）。指数值与 A2 完全一致（638 条逐一比对，差值为 0）。比 A2 多出的字段及非空数：

| 字段 | 非空 | 字段 | 非空 |
|---|---|---|---|
| `gpqa` | 614 | `mmlu_pro` | 349 |
| `hle` | 610 | `livecodebench` | 343 |
| `lcr` | 520 | `artificial_analysis_math_index` | 270 |
| `ifbench` | 450 | `aime_25` | 270 |
| `tau2` | 440 | `terminalbench_v2_1` | 238 |
| `terminalbench_hard` | 432 | `tau_banking` | 206 |
| `math_500` | 202 | `aime` | 194 |
| `scicode` | 170 | | |

单项分数为 0–1 的比例（如 `gpqa: 0.895`）。该端点没有 agentic index、缓存价格、端到端时延、每任务成本；其价格与速度字段用 **0 表示未测量**（234 条价格为 0、455 条速度为 0），与 A2 的 null 约定不同。

### A4. Media arena（Elo 榜）
端点 `GET /media/text-to-image/models/free`（159 条）、`GET /media/text-to-video/models/free`（83 条），扣 A1 配额。记录字段仅：`id, name, slug, model_creator{id,name}, elo, ci_95`。实测 Elo 范围：文生图顶部 1187（GPT Image 2.5 Flare (max)），文生视频顶部 1334（Wan 3.0）。文档还列出 image-editing、image-to-video、text-to-video-audio、image-to-video-audio 的 `/free` 端点（未拉取）。

### A5. 拿不到的数据（Pro / Commercial 档才有）
开源权重/许可证、reasoning 模型标记、context window、参数量、模态、模型页 URL、性能分位数、blended 价格、按 provider 拆分的数据、性能随时间序列。

### A6. AA 官网使用的厂商色与 logo（非 API，抓自首页图表 payload）
色值（十六进制原样）：Anthropic `#cc785c`、OpenAI `#1f1f1f`、Google `#34A853`、Meta `#0089f4`、Z AI `#1c7ff8`、SpaceXAI `#736cd3`、Kimi `#047AFE`、DeepSeek `#2243e6`、Alibaba `#ff7018`、Mistral `#fd6f00`、NVIDIA `#76b900`、Microsoft `#005597`、MiniMax `#EB3568`、Amazon `#F8981C`、MBZUAI `#1521a9`、Thinking Machines `#676767`。其余 43 家厂商无对应色值。
Logo：`https://artificialanalysis.ai/img/logos/<vendor>_small.svg`（部分为 .png/.jpg/.webp；例 `anthropic_small.svg`、`openai_small.svg`、`google_small.svg`、`meta_small.svg`、`zai_small.svg`、`spacexai.svg`、`kimi.jpg`、`deepseek_small.svg`、`alibaba_small.svg`、`mistral_small.png`、`nvidia_small.svg`、`xiaomi_small.svg`、`ibm_small.svg`）。首页共引用 135 个 logo 文件，完整列表在 `data/aa/site/homepage_logos.txt`。这些是第三方商标；壁纸若发布到 Workshop 需自行评估。

---

## B. 以什么形式返回

### B1. 交付物
取数层脚本 `shared/aa/aa-fetch.js`在壁纸内运行，负责 API 调用、分页、归一化、缓存、节流、重试，产出全局对象 **`window.AA_DATA`** 并派发 DOM 事件。渲染层只读 `window.AA_DATA`，不接触 API 与 key。开发时可把 `data/aa/language/cosmos-data.json` 包成 `window.COSMOS_DATA_BUNDLED`（`tools/build.py` 自动做）离线使用。

### B2. `window.AA_DATA` Schema v1

```ts
type AAData = {
  schema_version: 1;
  fetched_at: string;                  // ISO 8601 UTC，本次数据抓取时刻
  previous_fetched_at: string | null;  // 上一次成功抓取时刻；首次 null
  intelligence_index_version: string;  // 例 "4.3"
  source: "Artificial Analysis";
  source_url: "https://artificialanalysis.ai/";
  attribution: "Data: Artificial Analysis · artificialanalysis.ai"; // A1 的署名义务文案
  counts: { models: number; with_intelligence: number; families: number; with_speed: number; with_price: number };
  models: Model[];    // 按 rank_intelligence 升序；intelligence 为 null 的排在末尾
  arenas: { text_to_image: ArenaEntry[]; text_to_video: ArenaEntry[] }; // 各自按 elo 降序
};

type Model = {
  id: string;                    // AA 稳定 id，跨次刷新不变
  name: string;                  // API 原始全名（≤ 70 字符）
  slug: string;                  // API 原始 slug
  family: string;                // name 去掉末尾一对括号及其内容后的文本（≤ 39 字符）
  family_key: string;            // family 的 slug（小写、非字母数字替换为 -）
  variant: string | null;        // 末尾括号内原文；无括号为 null
  short_variant: string | null;  // 归一化规则：variant 中含 max/xhigh/high/medium/low/minimal 之一 → 该词小写；
                                 //   否则含 "non-reasoning" → "non-reasoning"；含 "reasoning" → "reasoning"；否则 = variant
  short_label: string;           // family + (short_variant ? " (" + short_variant + ")" : "")；前 100 名内 ≤ 38 字符
  creator: string;               // model_creator.name
  creator_key: string;           // creator 的 slug
  creator_color: string | null;  // A6 的色值；无则 null
  release_date: string | null;   // YYYY-MM-DD
  days_since_release: number | null; // fetched_at 当日 − release_date，整数天
  intelligence: number | null;   // = artificial_analysis_intelligence_index
  coding: number | null;         // = artificial_analysis_coding_index
  agentic: number | null;        // = artificial_analysis_agentic_index
  tps: number | null;            // = median_output_tokens_per_second
  ttft_s: number | null;         // = median_time_to_first_token_seconds
  ttfat_s: number | null;        // = median_time_to_first_answer_token_seconds
  e2e_s: number | null;          // = median_end_to_end_response_time_seconds
  price_in: number | null;       // = price_1m_input_tokens
  price_out: number | null;      // = price_1m_output_tokens
  price_cache_hit: number | null; price_cache_write: number | null;
  cost_per_task: number | null;  // = artificial_analysis_intelligence_index_cost.cost_per_task.total_cost
  index_run_cost: number | null; // = artificial_analysis_intelligence_index_cost.total_cost
  rank_intelligence: number | null;        // 全部有 intelligence 的模型按其降序的名次（1 起；同分按 name 排序）
  is_family_best: boolean;                 // 同一 family_key 中 intelligence 最高的那条为 true
  rank_intelligence_family: number | null; // 仅在 is_family_best === true 的集合内的名次
  prev_rank_intelligence: number | null;   // 上一次抓取时该 id 的 rank_intelligence；上次不存在则 null
};

type ArenaEntry = { id: string; name: string; family: string; variant: string | null;
                    creator: string; creator_color: string | null; elo: number; ci_95: number | null; rank: number };
```

- 所有数值字段的 `null` 含义同 A2（未测量 / 不适用）。
- 派生字段（family / short_* / rank_* / is_family_best / prev_rank_*）是取数层的计算结果，规则如上；渲染层如需其他派生字段或单项 benchmark（A3）、其他 arena（A4），取数层可以增加，schema_version 递增。
- 单条 `Model` 真实样例：

```json
{"id":"3e87c73e-a257-495e-9730-367a66229811","name":"Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)","slug":"claude-fable-5-1","family":"Claude Fable 5.1","family_key":"claude-fable-5-1","variant":"Adaptive Reasoning, Max Effort, Default Fallback","short_variant":"max","short_label":"Claude Fable 5.1 (max)","creator":"Anthropic","creator_key":"anthropic","creator_color":"#cc785c","release_date":"2026-09-01","days_since_release":10,"intelligence":53.4,"coding":81.6,"agentic":58,"tps":66.72,"ttft_s":278.2,"ttfat_s":278.2,"e2e_s":285.7,"price_in":10,"price_out":50,"price_cache_hit":0.25,"price_cache_write":12.5,"cost_per_task":7.6297,"index_run_cost":13128.86,"is_family_best":true,"rank_intelligence":1,"rank_intelligence_family":1,"prev_rank_intelligence":null}
```

### B3. 事件接口与时序

```js
document.addEventListener('aa:data',   e => { /* e.detail: AAData */ });
document.addEventListener('aa:status', e => { /* e.detail: { state, message?, fetched_at?, next_refresh_at? } */ });
document.addEventListener('aa:props',  e => { /* e.detail: WE 用户属性对象（C3），apikey 已剔除 */ });
if (window.AA_DATA) { /* 页面加载时若数据已存在（fixture 或缓存），可直接读 */ }
```

- `state` 取值：`loading`（正在请求）、`ok`（本次抓取成功）、`stale`（请求失败，`AA_DATA` 为上次缓存）、`error`（无缓存且请求失败，`AA_DATA` 为 undefined）。
- 时序：页面加载 → 若 `localStorage` 有缓存则立刻派发 `aa:data`（缓存数据） → 若距上次抓取 ≥ 4 小时则请求 API → 成功后再派发一次 `aa:data`（新数据）。此后每分钟检查一次是否到 4 小时；WE 暂停壁纸期间定时器可能停摆，恢复后按时间戳补做。
- 每次刷新请求数：主数据 4 次；arena 各 1 次（每 24 小时刷一次）；A3 旧端点如启用再 +1（独立配额）。
- 两次刷新之间的数据变化幅度（观察事实）：多数字段不变；AA 会不定期更新个别模型的性能中位数与价格；新模型上榜时出现新 `id`；最近 30 天出现了 48 个新模型。
- `window.wallpaperPropertyListener` 由取数层持有（用于读取 `apikey`）；渲染层通过 `aa:props` 拿到其余属性。

---

## C. Wallpaper Engine 接受什么格式 / 样式

### C1. 壁纸类型与文件结构
- 能联网的只有 **Web 类型壁纸**（Scene / Video 类型不能，WE 开发者原话）。
- 一个文件夹：`index.html`（入口，可任意命名，在 project.json `file` 指定）+ 任意 CSS / JS / 字体 / 图片 / 视频 + `project.json`。
- WE 官方要求（文档原文）："avoid loading any important wallpaper files from the web unless absolutely necessary" —— 字体、脚本、图片需放在壁纸目录内；本机探针实测同目录文件可通过 `<script src>`、`<link>`、`fetch()`、XHR 读取（HTTP 状态 200）。目录外的本地文件被 WE 禁止。
- 视频格式（若使用）：`.webm`、`.ogg`、`.ogv`。
- 缩略图：project.json `preview` 指向目录内的 `.jpg` / `.png` / `.gif`，用于 WE 库列表。
- 导入：WE 编辑器 → 把入口 HTML 拖到 **Create Wallpaper**，WE 复制整个目录到 `D:\Steam\steamapps\common\wallpaper_engine\projects\myprojects\<name>\`。也可直接把目录放到该路径。

### C2. project.json 格式（参考 WE 自带的 `defaultprojects/corsair_o_tron`）

```json
{
  "title": "AA Leaderboard",
  "description": "…",
  "file": "index.html",
  "type": "web",
  "contentrating": "Everyone",
  "preview": "preview.jpg",
  "tags": ["Technology"],
  "general": {
    "supportsaudioprocessing": false,
    "properties": {
      "apikey":  { "order": 0, "text": "Artificial Analysis API key", "type": "textinput", "value": "" },
      "example_slider": { "order": 1, "text": "…", "type": "slider", "min": 1, "max": 50, "value": 20 },
      "example_color":  { "order": 2, "text": "…", "type": "color", "value": "1 1 1" },
      "example_bool":   { "order": 3, "text": "…", "type": "bool", "value": true },
      "example_combo":  { "order": 4, "text": "…", "type": "combo", "value": "a",
                          "options": [ { "label": "A", "value": "a" }, { "label": "B", "value": "b" } ] },
      "example_cond":   { "order": 5, "text": "…", "type": "bool", "value": false, "condition": "example_bool.value" }
    }
  }
}
```

用户属性类型（WE 文档）：`color`（值为 `"r g b"` 三个 0–1 浮点，空格分隔）、`slider`（`min`/`max`，可 `fraction`）、`bool`、`combo`（`options[{label,value}]`）、`textinput`、`file`（图片/视频，路径需加 `file:///` 前缀使用）、`directory`（`mode: "ondemand" | "fetchall"`）。`condition` 可按其他属性的值显示/隐藏（文档 "Display Conditions"）。这些属性出现在 WE 的壁纸设置面板里，由用户调整。

### C3. WE 暴露给页面的 JavaScript 接口（文档标识符原文）

```js
window.wallpaperPropertyListener = {
  applyUserProperties: function (props) { /* 首次加载 + 用户改动时触发；只含变动的属性；props.<key>.value */ },
  applyGeneralProperties: function (props) { /* props.fps = 用户在 WE Performance 里设的 FPS 上限，0 = 不限；加载时与变更时触发 */ },
  userDirectoryFilesAddedOrChanged: function (propertyName, files) {}, // directory 属性 fetchall 模式
  userDirectoryFilesRemoved: function (propertyName, files) {}
};
window.wallpaperRequestRandomFileForProperty(propertyKey, callback); // directory 属性 ondemand 模式
window.wallpaperRegisterAudioListener(function (audioArray) {});    // 系统音频：长度 128 的数组，约 30 次/秒；
                                                                     // 0–63 左声道、64–127 右声道，索引越小频率越低
window.wallpaperMediaStatusListener / wallpaperMediaPropertiesListener / wallpaperMediaThumbnailListener /
window.wallpaperMediaPlaybackListener / wallpaperMediaTimelineListener   // 当前播放的媒体信息（标题、封面、进度）
window.wallpaperPluginListener                                          // RGB 硬件（iCUE 等）
```

文档：<https://docs.wallpaperengine.io/en/web/overview.html>（属性、音频、媒体、FPS、RGB、调试各有子页）。

### C4. 运行时环境（WE 内探针实测，2026-09-11）

| 项 | 实测值 |
|---|---|
| 浏览器 | CEF，`navigator.userAgent` = `… Chrome/146.0.0.0 Safari/537.36`（WE 2.8.42） |
| 页面地址 | `file:///D:/STEAM/steamapps/common/wallpaper_engine/projects/myprojects/<name>/index.html` |
| `devicePixelRatio` | 1 |
| `screen.width × height` | 2560 × 1440（主屏物理分辨率；Windows 显示缩放 125% 对页面无影响） |
| `innerWidth × innerHeight` | 编辑器预览窗内为 1437 × 1242（预览窗尺寸）；应用到桌面后预期为 2560 × 1440，尚未在桌面上实测 |
| `localStorage` | 可读写，跨壁纸重载保留 |
| 同目录文件 | `<script src>` / `fetch` / XHR 均可，状态 200 |
| 跨域 HTTPS 请求 | 可以，CORS 不强制（带自定义头的请求也能读到响应） |
| 鼠标事件 | 标准 `mousemove` / `click` / `mouseenter` / `mouseleave` 可用（WE 会把桌面上的鼠标事件传给壁纸） |
| 键盘事件 | **不可用**（WE 未实现，开发者称出于安全考虑） |
| 网页能力 | Chromium 146 全部特性：CSS Grid、container queries、`color-mix()`、`backdrop-filter`、`@property`、View Transitions、Canvas 2D、WebGL、Web Animations、`requestAnimationFrame` |

### C5. 桌面上的显示条件（事实）
- 目标显示器：主屏 2560 × 1440，16:9，只做这一块屏。
- 操作系统：Windows 11 Home，显示缩放 125%。
- 任务栏：位于底部，高度 48 逻辑 px = **60 物理 px**（`Screen.WorkingArea` 实测），覆盖在壁纸之上。
- 桌面图标：覆盖在壁纸之上；位置由用户的桌面布局决定，**尚未提供**。
- WE 全局 Web 壁纸 FPS 上限：本机 config.json `"fps": 15`（WE 默认值），用户可在 WE 设置 → Performance 改为任意值；该值通过 C3 的 `applyGeneralProperties.fps` 传给页面。
- WE 在其他应用全屏或（按设置）其他窗口聚焦时暂停壁纸渲染；恢复后继续。
- 壁纸页面没有浏览器 UI，没有滚动条需求（视口即整屏）。
- GPU：RTX 5080。

### C6. 调试
WE 设置 → General → **CEF devtools port** 填 `8080` → 桌面 Chrome 打开 `http://localhost:8080` → 选壁纸页面，得到完整 Chrome DevTools（console / elements / performance）。壁纸每次重载后需回到列表页重新选择。

---

## D. 文件清单
- `data/aa/language/cosmos-data.json` — 归一化导出（2026-09-11）；`data/aa/language/snapshots/` — 不可变原始快照
- `data/aa/language/raw/` — A2/A3 原始响应；`data/aa/media/` — A4；`data/aa/site/` — A6 来源
- `tools/aa/pull.py`（拉取，扣配额）、`tools/aa/export_cosmos.py`（归一化参考实现）
- `shared/we/probe/` — C4 的探针壁纸
