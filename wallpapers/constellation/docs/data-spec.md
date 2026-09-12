# Cosmos 数据需求（astra 原文，2026-09-11）

> *(Chinese) astra's data requirements for the "AI Cosmos" demo dataset, implemented by `tools/aa/export_cosmos.py`.*

> 由美术专家（gpt astra）提出，`tools/aa/export_cosmos.py` 按此实现，输出 `data/aa/language/cosmos-data.json`。

我要为一个 Wallpaper Engine 动态壁纸 Demo 准备一份真实的 Artificial Analysis 数据集。

这个 Demo 的视觉概念叫 **AI Cosmos**：

* 一个模型 family = 一个恒星系统
* family 中 Intelligence 最高的 variant = 主星
* 其他 variant = 围绕主星的卫星 / 行星
* Intelligence = 主星视觉质量 / 尺寸 / 引力感
* Creator = 色彩谱系
* Release age = 恒星年龄 / 新鲜程度
* TPS = 动态活跃程度
* Coding / Agentic = 星体几何结构
* Rank change = 星体运动轨迹 / 上升下降趋势
* Price / latency / cost = 鼠标靠近后的第二层信息，不决定主布局

请只负责 **获取、整理、验证和导出真实数据**。

不要写 UI。不要设计壁纸。不要生成模拟数据。不要为了填空而推测不存在的值。不要把 null 当成 0。

最终请输出一个可以直接交给另一个程序读取的：`cosmos-data.json`

# 1. 数据源
使用 Artificial Analysis 官方 Data API：`GET /language/models/free?page=1..4`。使用我本地已有的 API key。获取全部分页，不要只获取 leaderboard 前几十名。预期约 647 个 model records，但不要把 647 写死，以本次实际 API 返回数量为准。
本次 Demo 暂时不要请求：Media Arena、text-to-image、text-to-video、旧版单项 benchmark endpoint、logo 图片、其他网页 DOM 数据。

# 2. 必须保存的原始字段
Identity: `id`、`name`、`slug`、`model_creator.id`、`model_creator.name`、`release_date`
Evaluation: `artificial_analysis_intelligence_index`、`artificial_analysis_coding_index`、`artificial_analysis_agentic_index`
Performance: `median_output_tokens_per_second`、`median_time_to_first_token_seconds`、`median_time_to_first_answer_token_seconds`、`median_end_to_end_response_time_seconds`
Pricing: `price_1m_input_tokens`、`price_1m_output_tokens`、`price_1m_cache_hit_tokens`、`price_1m_cache_write_tokens`
Evaluation cost: `artificial_analysis_intelligence_index_cost.total_cost`、`artificial_analysis_intelligence_index_cost.cost_per_task.total_cost`
所有 API 返回的 `null` 必须保持 `null`。绝对不能：null → 0、null → ""、自动补平均值/中位数、自动猜测价格/性能。真实的 `0` 则必须保留为数值 0。

# 3. 当前 Snapshot 元数据
顶层：`schema_version: 1`、`source`、`source_url`、`fetched_at`（ISO 8601 UTC）、`previous_fetched_at`（本地存在上一份真实 snapshot 则填其抓取时间，否则 null；禁止伪造）、`intelligence_index_version`（API 实际返回，不手写）、`attribution: "Data: Artificial Analysis · artificialanalysis.ai"`。

# 4. Model 标准化
`models[]` 每条：id, name, slug, family, family_key, variant, short_variant, short_label, creator, creator_key, creator_color, release_date, days_since_release, intelligence, coding, agentic, tps, ttft_s, ttfat_s, e2e_s, price_in, price_out, price_cache_hit, price_cache_write, cost_per_task, index_run_cost, rank_intelligence, is_family_best, rank_intelligence_family, prev_rank_intelligence, prev_rank_intelligence_family, rank_delta, family_rank_delta, previous_intelligence, intelligence_delta。

# 5. Family / Variant 解析规则
名称末尾若有一组括号，只移除**末尾最后一对括号及其中内容**作为 variant，其余为 family。不要删除名称内部的括号。

# 6. short_variant 规则
按优先级（大小写不敏感）：包含 `max`→"max"、`xhigh`→"xhigh"、`high`→"high"、`medium`→"medium"、`low`→"low"、`minimal`→"minimal"、`non-reasoning`→"non-reasoning"、`reasoning`→"reasoning"；注意 `xhigh` 不能误配成 `high`。都不属于则保留原始 variant；无 variant 则 null。

# 7. short_label
`family + optional " (" + short_variant + ")"`。不要主动截断。

# 8. Key 标准化
family_key / creator_key：lowercase → 连续非字母数字替换为 `-` → 去掉首尾 `-` → 合并连续 `-`。

# 9. Creator Color
使用本地已取得的 AA 首页 chart creator color mapping；没有的填 null。不要自己生成或猜颜色。

# 10. days_since_release
基于 fetched_at 的 UTC 日期：fetch date − release_date，整数天；无 release_date → null；当天 → 0。

# 11. 全模型 Intelligence Rank
只对 intelligence != null 排名：intelligence 降序，相同时 name 字典序；从 1 开始；null → rank null。

# 12. Family Best
按 family_key 分组，每组 intelligence 最高者 is_family_best = true；相同用 name 字典序保证稳定。

# 13. Family Rank
只取 is_family_best && intelligence != null，按 intelligence 降序排名写入 rank_intelligence_family；其余 null。

# 14. Previous Snapshot
检查本地是否有上一轮**真实**抓取的 snapshot（上一轮 AA_DATA / local cache / 实际拉取过的历史文件 / raw backup / previous normalized output）。不要根据当前数据模拟 previous。没有则所有 previous 字段为 null。

# 15. Previous Model Rank
按相同 id 连接，写入 prev_rank_intelligence；上一轮不存在 → null。

# 16. Previous Family Rank
对 previous snapshot 使用完全相同的 family parsing / family best selection / Intelligence sorting 重新计算上一轮 rank_intelligence_family，通过 family_key 连接；写入当前 family best model 的 prev_rank_intelligence_family；上一轮无此 family → null。

# 17. Rank Delta
`previous rank − current rank`（+3 = 上升 3 名）。写入 rank_delta 与 family_rank_delta；任一侧不存在 → null。新模型不要写成巨大正数。

# 18. Intelligence Delta
同一 model 在 previous 存在：`current − previous` 写入 intelligence_delta，同时保存 previous_intelligence；任一侧为 null → delta null。

# 19. families 数组
每 family 一条：family, family_key, creator, creator_key, creator_color, best_model_id, best_model_name, best_short_label, rank, prev_rank, rank_delta, intelligence, previous_intelligence, intelligence_delta, coding, agentic, tps, ttft_s, ttfat_s, e2e_s, price_in, price_out, cost_per_task, release_date, days_since_release, variant_count, variant_ids。指标全部来自 family best record，不求平均。variant_ids：best 第一，其余 intelligence 降序，null 最后。

# 20. creators 数组
name, key, color, model_count, family_count, top_family_rank, top_family_key, mean_family_intelligence, median_family_intelligence。统计只用 family best + intelligence != null，不重复计入 effort variants。

# 21. stats
对 intelligence, coding, agentic, tps, ttft_s, ttfat_s, e2e_s, price_in, price_out, cost_per_task, days_since_release，样本 = families[]（family best）。每字段：count, min, p05, p10, p25, median, p75, p90, p95, max。忽略 null，真实 0 不忽略。Percentile 算法需明确、常见、稳定，并说明。

# 22. counts
models, families, creators, with_intelligence, with_coding, with_agentic, with_speed, with_price, with_cost_per_task, families_with_multiple_variants, new_models_30d, new_families_30d。

# 23. cosmos_selection
core = family rank 1–40 的 key；midfield = 41–120；background = 121–300（不足到末尾即可）；featured_systems = Top 30 family 中 variant_count >= 2 的全部，按 rank 排序。不人为挑厂商，不为视觉均衡修改排名。

# 24. new_releases
family best 中 days_since_release <= 30，按 days_since_release 升序、intelligence 降序：{family_key, release_date, days_since_release, rank, intelligence}。

# 25. movers
有 previous 时：up = family_rank_delta > 0 按 delta 降序最多 20；down = < 0 按 delta 升序最多 20；new = previous 无该 family 但 current 有，按 rank 升序最多 20。无 previous → 三个数组为空，不伪造。

# 26. 顶层结构
schema_version, source, source_url, attribution, fetched_at, previous_fetched_at, intelligence_index_version, counts, stats, creators, families, models, cosmos_selection{core, midfield, background, featured_systems}, new_releases, movers{up, down, new}。

# 27. 排序
models：rank_intelligence 非 null 在前、升序，null 最后，name 稳定排序。families：rank 非 null 在前、升序，null 最后，family 字典序。creators：top_family_rank 非 null 在前、升序，name 字典序。

# 28. 数值精度
保存计算后的原始数字，不做展示格式化；derived delta 可保留合理小数精度，不随意整数化。

# 29. 完整性验证
Identity：id 不重复、family_key 非空、creator 非空。Rank：非 null rank_intelligence 唯一、非 null rank_intelligence_family 唯一且只出现在 family best。Family：每 family 恰好一个 best、families.length == unique family_key 数、best_model_id 存在、variant_ids 存在且不跨 family。Null：null 没变 0、0 没变 null。Selection：core/midfield/background 不重复、key 都存在、featured_systems variant_count >= 2。Previous：无真实 previous 时确认没有伪造的 delta。

# 30. validation summary
终端输出：fetched at、index version、models/families/creators、各覆盖数、multi-variant families、released in last 30d、Previous snapshot FOUND/NOT FOUND、最大上升/下降 family movement、Top 10 family leaderboard。无 previous 时明确输出 "Previous snapshot: NOT FOUND / Movement data left null/empty."

# 31. 不要做
不生成模拟数据；不猜 creator color；不 null→0、0→null；不人工选"好看的模型"；不修改排名；不平衡厂商数量；不删除低排名数据；不提前转显示字符串；不生成 UI/CSS/Canvas/WebGL/WE 项目。
