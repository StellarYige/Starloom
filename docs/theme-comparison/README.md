# 三套主题真实成品

[打开对照页](index.html)。每张图片可点击查看原尺寸 PNG；以下文件由浏览器端到端测试操作实际编辑器、点击下载获得，没有另画展示图。

| 主题       | 生日贺图 · 2400 × 3000                   | 应援头像 · 1600 × 1600                   |
| ---------- | ---------------------------------------- | ---------------------------------------- |
| 生日来信   | [原尺寸 PNG](birthday-letter-poster.png) | [原尺寸 PNG](birthday-letter-avatar.png) |
| 心动拍立得 | [原尺寸 PNG](heart-polaroid-poster.png)  | [原尺寸 PNG](heart-polaroid-avatar.png)  |
| 此刻主场   | [原尺寸 PNG](center-stage-poster.png)    | [原尺寸 PNG](center-stage-avatar.png)    |

## 统一输入

- 照片：项目的 `public/assets/portrait.jpg`，Aiony Haust / Unsplash，原文件保持不变。
- 姓名：林予安；生日：08 月 16 日；应援色：`#75866B`。
- 祝福（中间有一次手动换行）：

  ```text
  愿你一直被爱，也一直自由。
  新的一岁，继续闪闪发光。
  ```

- 装饰：星芒和细线均开启。
- 裁切：新建时的默认裁切，依次选择生日来信、心动拍立得、此刻主场，没有手动拖动或缩放。切换时按主题适配照片中心与边界，每套头像、贺图采用独立布局。
- 导出环境：Windows、Microsoft Edge 152.0.4191.66、桌面视口 1440 × 1000。完整验收结果见根目录 [TESTING.md](../../TESTING.md)。

## 复现

在项目根目录运行：

```sh
npm ci
npm run test:e2e -- --project=desktop --grep "three themes export"
```

测试会启动本地开发站点，创建独立浏览器会话，执行真实操作与 PNG 下载。六张图片输出到 `.qa/test-results/works-three-themes-export-…-desktop/`。也可手动新建默认作品，按上述顺序分别导出。运行测试会重建 `.qa/test-results/`，本目录的交付图片保留。

对照页为独立静态 HTML，可以直接打开；开发服务器运行时，也可访问 `/docs/theme-comparison/`。本目录作为开发文档提供，不加入应用的 `dist/`，不增加用户制作物料时的加载量。

## 来源与许可

示例姓名、生日和文案是虚构演示，不对应照片人物，也不表示其为项目代言。照片保留 Unsplash License；字体保留 SIL OFL 1.1；原创排版、装饰与文案采用 MIT。完整来源及许可见 [素材清单](../../public/licenses/ASSETS.md)，不能将整张图片的第三方素材统一改授 MIT。
