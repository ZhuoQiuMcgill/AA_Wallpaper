# AI Constellation Leaderboard — Art Direction / 美术定调

> *(Chinese) The art direction for this wallpaper, written by gpt astra and reproduced verbatim; the user's later amendments are listed at the end. English readers: the visual rules are numbers-first (rank + score always visible), constellations as the composition unit, non-radial closed figures, thin broken star-chart lines, observatory-style hover, very slow ambient motion.*

> 作者：gpt astra（2026-09-11）。本文是渲染层的视觉依据，原文照录；文末"后续修订"记录用户之后的决定。

## 1. 核心定位

这张壁纸首先是一张 **Leaderboard**，其次才是一张艺术壁纸。它每天应该让用户在几秒钟内得到三个答案：现在谁排名最高？每个模型的 Intelligence 分数是多少？哪些模型家族在榜单中占据了更多位置？但这些信息不采用传统表格、横条图、卡片列表或 Dashboard 的形式，而被重新组织成一张 **AI 天文星图**。因此整个作品的核心矛盾不是"信息 vs 艺术"，而是：**让信息本身成为艺术构图的一部分。**

## 2. 世界观

整个画面被理解为一张正在观测中的 **AI Intelligence Sky Atlas**。每个模型不是普通的数据点，而是一颗被编号的恒星。同一个模型 family 的不同 variant 组成一个星座。不同厂商拥有不同的光谱颜色。榜单排名越高的模型，在天空中的视觉权重越强。整个排行榜不是一列从 1 到 40 的名单，而是一片由多个星座共同构成的"AI 前沿天空"。

## 3. 第一视觉原则：数字永远不能被抽象视觉取代

必须直接显示 Rank、Intelligence Score、Model / Variant Identity，例如 **01 / 53.4 / Claude Fable 5.1 · max**，而不是只通过星星大小、明暗、位置、光晕来暗示它更强。视觉编码是第二通道，数字才是事实。

## 4. 第二视觉原则：Family 是构图单位，而不是模型

传统排行榜以单个模型作为一行。这个设计里 **Family 是一个完整的星座**：一个 family 有五个 variant 上榜，它就拥有五颗主要恒星；只有一个模型进入榜单，它可能就是一颗孤星。用户可以不读文字，就先通过星座的复杂程度发现哪个模型家族正在大量占据榜单。Family / variant 的区分本身已经存在于数据层，视觉结构应该忠实使用真实 family，而不是人为按厂商重新归类。（→ 见文末修订 1）

## 5. 星座形态语言

最重要的要求：**禁止统一中心放射型结构**。绝不能变成"主星在中心，副星向四周连接"，否则所有 family 最终都会成为花朵/太阳/网络拓扑图，而不是星座。星座必须存在明显的轮廓差异。

推荐的形态家族：Diamond / Kite（菱形、风筝型，稳定、完整、易识别）；Gemini（双柱、双链，两组节点平行发展、局部连接）；Lyra（不规则四边形 + 延伸节点，紧凑、经典星座感）；Hook（钩形/弧线，一个强势节点位于端点）；Spine（长脊柱，方向性强）；Fork / Y（主干之后分叉，表现 family 内部不同 variant 路线）；Crown（开放式冠状折线）；Serpent（连续折线、蛇形，适合较多节点）；Dipper（勺柄 + 勺斗）；Loose Constellation（部分节点完全不连，只通过位置关系与少量关键线条表示属于同一 family——这一类尤其重要：真实星座感来自**克制的连接，而不是把所有点连接完整**）。

## 6. 最强模型的位置

一个 family 最强的模型不要求位于星座中心。它可以出现在顶端、左端、右端、菱形某一个角、长链的起点、双柱其中一端、分叉交汇处。"最强"主要由 Rank 数字权重更强、星体稍亮、Score 更明确、Label 信息更完整来体现，而不是永远放中央。

## 7. 排名的视觉语言

Rank 应该成为整张作品最重要的 Typography 元素之一（01 / 53.4 / Claude Fable 5.1 · max）。Rank 应明显大于普通 UI 数字，#01 #02 #03 可以具有更强视觉权重。但避免奖牌、皇冠、金银铜等传统排行榜视觉语言——这里不是电竞榜，这里是**天文编号**（STAR 01 / OBJECT 02 / AA–003），而不是 🥇🥈🥉。

## 8. Intelligence Score

Score 必须始终与 Rank 紧密绑定（01 / 53.4），不能让 53.4 离模型过远，用户必须能瞬间判断这个数属于哪颗星。Intelligence 是整张壁纸唯一需要长期常驻的主指标；Coding / Agentic / TPS / Price 等全部降到第二信息层。

## 9. Variant

Variant 是星座内部真正的"恒星身份"（max / xhigh / high / medium / low），比完整模型名更适合放在星体附近：01 / 53.4 / MAX。而 family 名（CLAUDE FABLE 5.1）只在星座区域显示一次，减少文字噪音。（→ 见文末修订 2）

## 10. Family Name

Family 名是"星座名称"，应该像传统星图上的 constellation label：视觉权重低于 Rank、低于 Score、高于普通辅助数据；全大写或 Small Caps，字距稍宽，不使用 UI Button / Card，自然悬浮在星座内部或旁边。

## 11. 色彩

颜色用于 Creator Identity。不同厂商延续 Artificial Analysis 已有的厂商颜色作为基底（Anthropic、Google、Meta、Z AI、SpaceXAI、Alibaba 等），但不能直接把网页 chart color 生硬复制成发光 RGB 点，应该经过天体化处理：原始橙色 → 琥珀恒星 / 铜色星云；原始蓝色 → 蓝白恒星 / 青色辉光；原始绿色 → 偏青绿色星光；原始紫色 → 紫蓝 / 电离云。颜色需要**有品牌辨识度，但不像品牌 Dashboard**。

## 12. 背景色

主背景不是纯黑，应该是非常深的蓝黑 / 石墨黑 / 极轻微紫黑，拥有极少量星尘、极暗星云、微弱远星，但不能变成传统的"银河照片壁纸"。主体必须仍然是数据星图。感觉更接近 **astronomical chart + deep space**，而不是 NASA photography。

## 13. 连线

星座线非常细、低透明度、不完全均匀、可以存在断点、不需要所有节点完全 connected。线条是识别 family 结构的辅助元素，星本身和数字必须比线更重要。避免粗 neon line、HUD glowing cable、赛博朋克电路线。我们想要的是**星图**。

## 14. 星体

Star 不应该全部只是普通圆点，但差异要非常克制：小型核心亮点、十字 diffraction glow、柔和 halo、极少量粒子。Top 3 可以拥有更明显的 stellar corona，普通模型保持细小。目标不是做写实恒星，而是 **data star glyph**。

## 15. 背景模型

主榜之外的模型仍然可以作为天空中的背景星，但不默认显示 Rank、不默认显示 Name、不使用明显连线。它们主要承担"AI ecosystem 比当前展示的 Top N 更大"这个空间感，这样主排行榜不会像漂浮在完全空洞的背景上。

## 16. 信息层级

默认状态只保留 Level 1 Rank、Level 2 Intelligence Score、Level 3 Variant、Level 4 Family Name；Hover 才进入 Level 5：Coding、Agentic、TPS、Latency、Price、Release date、Cost/task。这种层级必须严格，不能在默认画面把所有指标展开。

## 17. Hover 状态

Hover 不应该突然弹出传统 rectangular tooltip，更适合 **Observatory Annotation**：鼠标接近一颗星以后，从星体延伸一根极细 observation line，在附近展开一个轻量数据标签，视觉感觉像天文观测软件正在识别一颗天体。内容可以显示 Claude Fable 5.1 / Adaptive Reasoning / Max / Intelligence 53.4 / Coding 81.6 / Agentic 58.0 / TPS 66.7 / TTFT 278.2 s / $10 / $50 / Released 10d ago，但容器本身应该尽量弱化。

## 18. 点击状态

点击整个 constellation：不是弹出菜单，而是其他 family 慢慢降低亮度，被选中的 family 轻微展开，原本没有进入排行榜可视区域的 variants 可以成为更暗的小卫星。这时才真正观察一个 family 的完整内部结构。再次点击空白恢复。

## 19. 动态

这是桌面壁纸，不是网站 Hero Animation，因此动态必须非常慢；Wallpaper Engine 当前环境本身以较低 FPS 运行也完全适合这种 ambient motion。推荐：星体非常轻微呼吸、星云极慢漂移、星座整体几分钟尺度的位置变化、极偶尔出现一颗微小流星、新模型产生缓慢出生光。禁止：高速粒子、不停旋转、明显 bouncing、频繁 pulsing、大型镜头运动。最好的状态是：用户盯着它 3 秒钟时感觉完全稳定，但十分钟后重新看，会觉得"好像天空稍微动了一点"。

## 20. 排名变化

未来真实发生排名变化后，数字必须明确显示 ↑3 / ↓2，同时可以附带轻微视觉反馈：上升——短暂残留一条向上的星迹；下降——一条很弱的衰减轨迹。但视觉只能强化数字，不能替代数字。

## 21. 新模型

刚出现的新模型可以有较明显的新生光晕。不是"NEW!"，不是红点，而像一颗刚刚被观测到的恒星；随着 release age 增加，光晕逐渐稳定。

## 22. 整体构图

目标分辨率 2560 × 1440。主视觉区应集中于屏幕中央约 70–80% 区域。底部预留足够安全空间，因为 Windows Taskbar 会覆盖底部区域。不要把重要排名信息贴近屏幕边缘、底部任务栏、右下角系统区域。

## 23. 整体气质关键词

Astronomical · Scientific · Quiet · Precise · Premium · Mysterious · Informational · Observational · Timeless

## 24. 不应该出现的感觉

Cyberpunk HUD、RGB gamer、Stock sci-fi、Bloom overload、Glassmorphism dashboard、Crypto trading screen、Traditional leaderboard、NASA photo wallpaper、Corporate BI dashboard、Network graph、Skill-tree UI。尤其避免"节点 + 大量线条"最后变成知识图谱。

## 25. 最终一句话定义

这张壁纸不是"把排行榜画成星星"，而是：**如果现代 AI 模型是一片可以持续观测的星空，那么今天的 Intelligence Leaderboard 应该长什么样。** 用户首先通过 Rank 与 Score 得到事实，然后通过 Constellation 感知 family 的实力分布，最后通过颜色、形态与运动，感受到整个 AI landscape 正在持续变化。

---

## 后续修订（用户决定，2026-09-11）

1. **星座单位改为公司（creator）**，家族降为星座内的"星群"：Claude Fable 与 Opus 同属 ANTHROPIC 星座，GPT Astra / 5.6 Sol / Terra / Luna 同属 OPENAI 星座，以减少散星。星座名用公司名。家族 ≥3 星时必须是闭合多边形（参考天琴、猎户），不再出现纯放射或纯直线结构。
2. 每颗星的第二行由 "effort" 改为 **"家族名 · effort"**（CLAUDE FABLE 5.1 · MAX），家族名不再单独标注。
3. 名次 N+1..2N 的模型作为**暗星**聚在所属公司星座周围：无连线、无文字，点击聚焦时显示名次数字，悬停显示完整数据。
4. 整片星空约束在一个椭圆内（宽高可在 WE 设置里调），四角留给桌面图标。
