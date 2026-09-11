# 星迹 Starloom

**把喜欢，做成作品。**

一个不依赖 AI 的开源生日应援制作工具。选择主题，放入照片，写下姓名、生日和祝福，再用应援色制作配套头像与生日贺图。无需登录，所有图片处理、草稿保存及导出都在浏览器本地完成。

## 首版能做什么

- 一套完整的「生日来信」主题：温暖的杂志排版、照片为主、少量细线与星芒。
- 应援头像：1600 × 1600 PNG，展示姓名和生日；支持仅供预览的圆形安全区。
- 生日贺图：2400 × 3000 PNG，4:5 竖版，展示完整祝福。
- 两份作品共用照片、内容、配色和装饰，使用独立布局、独立移动和缩放参数。
- 鼠标与触屏拖动、缩放滑杆、方向键微调、文字编辑、预设与自定义应援色、装饰开关。
- 最近 50 步撤销重做，一次拖动或连续输入合并为一步；支持换图撤销。
- 当前一份本地草稿自动保存，刷新后恢复照片、内容及两套裁切。
- 导出原尺寸 PNG，手机可下载或点开原图长按保存；不加水印。

没有社区、云端作品托管、登录、AI 生图、自动抠图、付费接口、动态物料或打印功能。

## 启动

需要 Node.js 22.12+，推荐 Node.js 24 LTS，以及 npm。项目提交了 `package-lock.json`，推荐按锁文件安装：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址，默认是 http://127.0.0.1:5173/ 。

需要在同一局域网的手机上访问时：

```sh
npm run dev -- --host 0.0.0.0
```

在手机中打开终端显示的 Network 地址。生产部署推荐 HTTPS。

## 构建、预览与部署

```sh
npm run build
npm run preview
```

`build` 先执行 TypeScript 检查，再生成 `dist/`。把 **整个 `dist/` 目录的内容** 发布到任意静态托管即可，不需要 Node 服务、数据库、环境变量或 API 密钥。

| 部署方式                        | 设置                                      |
| ------------------------------- | ----------------------------------------- |
| GitHub Pages                    | 发布 `dist/` 内容，入口为 `index.html`    |
| Cloudflare Pages / Netlify      | 构建命令 `npm run build`，输出目录 `dist` |
| Nginx / Apache / 其他静态服务器 | 将 `dist/` 内容复制到站点目录             |

Vite 的 `base` 已设为 `./`，资源采用相对路径，支持 `/starloom/` 等子目录。应用使用单页内部状态切换，没有需要服务器重写的前端路径路由。请通过 HTTP(S) 访问，直接双击 `dist/index.html` 不属于支持的运行方式。

字体、示例照片和许可文件全部随静态文件发布。运行时不请求 Google Fonts、Unsplash、图片代理或第三方 API。首次打开仍需要从你部署的站点加载应用资源；首版未提供 PWA 或离线安装。

## 使用约定

- 照片支持 JPG、PNG、WebP，单文件最多 30 MB。HEIC 请先转换成 JPG。首版针对静态图片；不制作动画。
- 浏览器读取照片方向信息。最长边超过 4096px 时，在本机生成 4096px 工作副本；JPEG 使用高质量 JPEG 副本，其他格式保留透明通道。原文件不变。
- 小照片或过度放大可能使导出照片偏软；高像素导出不会补出原照片中没有的细节。
- 姓名最多 40 个字素，祝福最多 200 个字素。一个家庭 Emoji 或带组合音标的字母按一个字素计数。支持手动换行、中英文混排和连续长英文。
- 排版会换行并在模板规定的范围内缩小字号。超出字数或文字区域时，内容仍可编辑，应用明确提示并阻止导出，不静默截断。
- 生日只填写月日，允许 2 月 29 日，不计算年龄。
- 调整照片时可使用方向键，按住 Shift 移动更多。输入框外，Ctrl / ⌘ Z 撤销，Ctrl / ⌘ Shift Z 或 Ctrl Y 重做。输入框保留浏览器本身的文字撤销行为。

## 本地草稿与隐私

草稿保存在当前站点域名的 IndexedDB（`starloom-local`）中，项目状态与照片 Blob 在同一个事务内保存。停止修改约 500ms 后自动保存，离开字段、结束调整、页面转到后台时也会请求保存。写入按顺序执行，读取草稿完成前不写入默认内容。

请看到「已保存到本机」再关闭页面。正在输入时立即强制结束浏览器进程，最后尚未提交的修改可能来不及保存。草稿不跨设备、不跨浏览器、不跨域名；清理网站数据、无痕模式或浏览器存储回收可能移除草稿。撤销历史不在刷新后保留。

存储空间不足或被禁用时，应用显示保存失败，仍允许编辑和导出。损坏或不兼容的草稿不会被示例内容自动覆盖；可用「重新开始」明确替换当前草稿。首版每个浏览器站点仅有一个当前作品，请避免在多个标签页同时修改同一草稿。

不设置账户、不上传照片、不收集文本、不使用统计追踪服务。应用只读取用户主动选择的文件。部署站点自身的访问日志由其托管方决定。

## 代码结构与渲染

```text
src/
  templates/     主题清单和两份成品的声明式布局
  core/          类型、裁切、排版、配色、绘图、图片读取、历史和草稿
  hooks/         编辑生命周期、历史状态与保存队列
  components/    预览、主题选择和弹窗
  App.tsx        六步制作流程
  styles.css     响应式应用界面
tests/           浏览器端到端测试
public/
  assets/        随项目发布的示例照片
  licenses/      素材来源与完整字体、图标许可
```

界面使用 React + TypeScript + Vite。作品使用原生 Canvas 2D，不依赖自由画布框架或 DOM 截图库。

`TemplateDefinition` 定义逻辑尺寸、导出尺寸、图层、文字框、字体、配色与装饰。`ProjectState` 只保存内容、主题、照片引用和两份归一化裁切。`PhotoAsset` 保存照片 Blob 和尺寸信息。

预览与导出均调用 `renderArtwork`。文字按模板逻辑坐标测量排版，加载对应字符所需的本地字体后绘制；屏幕尺寸不会改变换行结果。导出冻结一份项目快照并单独解码照片，顺序生成两张 PNG，结束后释放绘图资源。预览中的画纸倾斜、阴影、圆形辅助线和操作控件不进入成品。

## 新增模板

1. 复制 `src/templates/birthday-letter.ts` 为新文件，导出一个符合 `TemplateDefinition` 的配置。
2. 设置唯一 `id`、`name`、`subtitle`、`tags` 和灵感配色 `palettes`。
3. 分别设计 `layouts.avatar` 和 `layouts.poster`，保留首版正方形头像与 4:5 贺图的成品约定，不能把一张布局直接缩放成另一张。每份布局需要一个 `photo` 图层。
4. 为姓名、祝福设置明确的 `width`、`height`、`size`、`minSize`、`lineHeight` 和 `maxLines`。头像只放姓名及生日；贺图保留完整祝福区域。
5. 在 `src/templates/index.ts` 的 `templates` 数组中注册新配置。主题选择器会自动显示新主题，不需要修改编辑器或另写导出逻辑。
6. 完成长文本、极端宽高比、独立裁切与导出验证，并更新素材许可清单。

```ts
import { birthdayLetter } from './birthday-letter'
import { yourTheme } from './your-theme'

export const templates = [birthdayLetter, yourTheme]
```

可用图层：`photo`、`text`、`rect`、`line`、`sparkle`。文字 `content` 可以绑定 `name`、`birthday`、`wish`，或写成 `{ literal: '固定文字' }`。颜色使用 `paper`、`ink`、`muted`、`accent`、`soft`、`white`、`onAccent`；渲染器会从应援色派生其余颜色，正文始终保持深色对比。

装饰通过 `decoration: 'sparkles'` 或 `'lines'` 绑定开关。现有字体角色为 `sans` 和 `serif`，对应本地 Noto Sans SC 与 Cormorant Garamond。不要为模板引入远程字体、图片或任意 HTML。首版只有一个照片槽位，照片位置由对应图层决定。

已发布模板的 `id` 应保持稳定。若要改变已有主题的布局含义，请用新的 `id` 并保留旧主题，避免改变用户恢复的作品。`version` 是模板元信息，当前草稿 schema 为 1，不进行隐式跨版本迁移。

## 测试

```sh
npm test
npm run test:e2e
npm run build
```

单元测试覆盖裁切边界、字素与排版、月份、色彩对比、历史合并和 IndexedDB 草稿。浏览器测试覆盖完整流程、真实下载与像素尺寸、预览导出对照、照片比例、透明度、长文本、触屏拖动、撤销重做、刷新恢复和存储失败。

端到端测试默认使用本机 Microsoft Edge 的独立无头会话，不读取个人浏览器资料。没有 Edge 时可指定已安装的 Chrome，或使用 Playwright Chromium：

```sh
# macOS / Linux
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e

# PowerShell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e
```

若使用 Playwright 自带的 Chromium，先执行 `npx playwright install chromium`，再将 `PLAYWRIGHT_CHANNEL` 设为 `chromium`。测试会自动启动本地站点；报告、截图和下载的 PNG 放在被 Git 忽略的 `.qa/` 目录中。

实际验收范围和限制见 [TESTING.md](TESTING.md)。手机视口与触屏模拟不等同于 iPhone / Android 真机测试。不同系统的 Emoji 和字体回退外观可能不同；同一次编辑的预览与导出使用同一个浏览器、同一套字体与绘图实现。

## 许可

代码与原创几何装饰采用 [MIT](LICENSE)。照片、字体、图标保留各自许可，未统一改授 MIT。完整来源、作者、资源位置和处理记录见 [素材清单](public/licenses/ASSETS.md)。发布源代码或构建产物时，请一起保留 `public/licenses/` / `dist/licenses/`。
