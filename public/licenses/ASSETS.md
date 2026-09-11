# Starloom 素材来源与许可

核对日期：2026-09-11。项目代码采用 MIT（同目录 `Starloom-MIT.txt`）；以下第三方素材仍按其各自许可发布。

## 示例照片

| 项目 | 记录 |
| --- | --- |
| 项目文件 | `public/assets/portrait.jpg`（构建后为 `assets/portrait.jpg`） |
| 摄影师 | Aiony Haust |
| 作品页 | https://unsplash.com/photos/3TLl_97HNJo |
| 摄影师主页 | https://unsplash.com/@aiony |
| 原始资源 | https://images.unsplash.com/photo-1534528741775-53994a69daeb |
| 获取参数 | `auto=format&fit=crop&w=1800&q=92` |
| 文件 SHA-256 | `6dbd19a7045e86738f01eca104c45bbe870da05e7af2a12b2af5e4dcefd519ff` |
| 许可 | Unsplash License：https://unsplash.com/license |
| 处理 | 通过 Unsplash 图片服务获取宽 1800px 的 JPEG；模板运行时裁切，不改写此文件 |
| 用途 | 仅用作编辑器示例照片，不暗示人物与项目存在合作或代言关系 |

Unsplash 标准许可允许免费使用、复制、修改和分发照片，包括商用；禁止未经显著修改销售照片，以及收集其照片建立相似或竞争服务。以上是本项目的许可记录摘要，具体条款以链接所示许可为准。此文件和照片应随项目一起保留。该照片不是 Unsplash+ 素材。

示例中的「林予安」、08 月 16 日及祝福文字是虚构的模板演示内容，并非对照片人物姓名、生日的陈述。

## 字体

| 字体与用途 | 来源 | 发布位置与许可 |
| --- | --- | --- |
| Noto Sans SC，400 / 500 / 600：中文、界面、正文 | https://github.com/notofonts/noto-cjk；https://fontsource.org/fonts/noto-sans-sc | npm `@fontsource/noto-sans-sc@5.3.0`，SIL OFL 1.1；完整许可见 `Noto-Sans-SC-OFL.txt` |
| Cormorant Garamond，Latin 500 / 500 Italic / 600：英文标题与日期 | https://github.com/CatharsisFonts/Cormorant；https://fontsource.org/fonts/cormorant-garamond | npm `@fontsource/cormorant-garamond@5.3.0`，SIL OFL 1.1；完整许可见 `Cormorant-Garamond-OFL.txt` |

字体通过固定在 lockfile 中的 Fontsource 包获取，保留包内原始字形与分片，不自行改名或修改。Vite 将使用到的字体文件与 CSS 一起放入构建产物；运行时从本站加载。系统 Emoji / 缺字回退字体由访问者设备提供，不随项目分发。

## 图标与原创装饰

| 素材 | 来源与处理 | 许可 |
| --- | --- | --- |
| 界面图标、品牌 Sparkle 图形、`favicon.svg` | Lucide：https://lucide.dev；npm `lucide-react@1.44.0`。favicon 由库内 Sparkle 图标直接渲染，仅调整大小、颜色与线宽 | ISC，完整许可见 `Lucide-LICENSE.txt` |
| 作品中的四角星芒、边框、细线、色块 | Starloom contributors 原创 Canvas 几何绘制，代码在 `src/core/render.ts`，布局在主题配置中 | MIT，与项目 `LICENSE` 相同 |
| 心动拍立得的错位纸张、相纸边框、日期标签；此刻主场的舞台色块与排版 | Starloom contributors 原创，使用现有矩形、线条、星芒与文字图层，未增加外部贴纸、照片或字体 | MIT，与项目 `LICENSE` 相同 |
| `docs/theme-comparison/` 的六张成品与对照页 | 使用上述 Aiony Haust 示例照片和现有字体，通过 Starloom 实际界面导出；示例姓名、生日、祝福为虚构 | 原创布局和文案采用 MIT；照片和字体仍保留各自许可，不改授 MIT |
| 界面底纹与卡片布局 | Starloom contributors 原创 CSS | MIT |
| 品牌文案与示例祝福 | Starloom contributors 原创文本 | MIT |

未使用影视剧截图、偶像照片、游戏立绘、未经授权的饭制图片、商业贴纸或付费字体。用户主动导入的照片不包含在项目分发中，仍归其相应权利人所有。

## 贡献新素材

提交新素材时，记录文件名、作者、准确来源 URL、许可及是否修改，并附上许可要求保留的版权声明。仅接受原创或明确允许随源代码及静态构建产物分发的素材。不要仅写「网上找的」「免费素材」或只提供搜索结果页；不要通过远程链接绕过分发许可。
