# 参与山海所知

[English](CONTRIBUTING.md)

本图集讲述每一种文化在何时知道世界的哪些部分。每一条这样的判断都应有出处，而目前仍有许多只凭一般常识。如果您熟悉某个地区、某个时代或某种文化，就能让它更准确。帮忙不需要会写代码，也不需要改动任何文件。

## 三种参与方式

### 一、指出错误

图集中的每一张卡片（地区、地点、旅程、发明、典籍、动植物）末尾都有 **提出更正**。点开会得到一份简短的表单，已经填好您正在看的内容、视角和年份。只需写明哪里有误、依据什么出处；我们会更新数据并致谢。

也可以[直接打开表单](https://github.com/Greenere/the-world-we-know/issues/new?template=correction.yml)。

### 二、为草稿补充出处

有些行仍引用占位来源：`draft`（凭一般常识的年份）或 `draft-urban`（城市年份，待与 Chandler《四千年城市增长》和 Modelski《世界城市》核对）。它们按地区列在标签为 [**needs source**](https://github.com/Greenere/the-world-we-know/issues?q=is%3Aopen+label%3A%22needs+source%22) 的议题中。挑几行核对，在议题下回复，或使用[出处表单](https://github.com/Greenere/the-world-we-know/issues/new?template=source.yml)。证实原有数据的出处，与修正数据的出处同样有用。

### 三、审阅一种文化的视角

每个视角都是一种文化的认知时间线。如果您熟悉这种文化的历史，最好是来自它自身的传统，请切换到这个视角，播放时间轴，打开各个地区看看。哪里知道得太早、太多，或太晚、太少，都请告诉我们。较大范围的审阅请到[讨论区](https://github.com/Greenere/the-world-we-know/discussions)。

## 好的出处

- **具体。** 注明页码或章节的书籍、文章，或注明段落的原始文献，而非笼统的网站。
- **贴近所述之事。** 关于“欧洲自公元前19年知道费赞”，普林尼记载巴尔布斯远征的原文胜过今人的概述；今人研究又胜过百科全书。
- **坦白存疑之处。** 每一行都有可信度：`high`（证据充分）、`medium`（可能，来源可靠）或 `low`（推测或有争议）。有出处的低可信度，胜过无出处的高可信度。

图集从不说“发现”，而说某个视角“首次知道”：那里几乎总是早已有人。

## 自己修改数据

如果您熟悉 git，欢迎提交拉取请求。所有数据都在 [`data/`](data) 中，[README](README.zh.md) 介绍了每个文件。

- 补充出处：把文献加入 `data/sources.csv`（`kind` 为 `work` 表示当时之作，`study` 表示今人研究），再在数据行中引用它的 id。
- `knowledge.csv` 中的一行，是某个视角对某个地区认知的一次变化：`viewpoint, region, year, level, confidence, source, note`。等级从 0（未知）、1 传闻、2 接触、3 海岸已测绘、4 内陆已绘图，到 5 已勘测。
- 大地区可以包含小地区（撒哈拉包含西部、中部与东部）。请把数据写在它所涉及的那一部分上；写在大地区上的一行会点亮其全境。
- 如果新增了说明文字，能的话请在 `data/i18n/zh/notes.json` 中加上中文；不会也没关系。

提交前请运行 `npm run data`（它会检查每一处引用并指出问题）和 `npm run build`，两者都须通过。

## 致谢与许可

采用您的更正或出处的提交中会向您致谢。数据以 [CC BY 4.0](data/LICENSE.md) 发布，代码以 [Mozilla Public License 2.0](LICENSE) 发布；参与贡献即表示您同意以相同条款共享您的贡献。
