# WeChaty Kimi Bot

一个基于 Node.js、Wechaty 和 Kimi API 的个人微信机器人项目。

项目重点不是只实现聊天功能，而是练习一套较完整的机器人工程结构：消息接入、访问控制、AI 服务编排、延迟回复、状态持久化、表情包管理、音乐播放、网络搜索和自动化测试。

> 项目定位：个人学习与实践项目，不代表生产级微信基础设施。运行前请确认符合微信、相关 API 服务以及依赖项目的使用条款。

## 功能

- 使用 Kimi API 进行中文对话，支持历史上下文和 429 限流重试。
- 将用户在短时间内连续发送的多条消息合并后再请求 AI，默认延迟 5 秒。
- 普通回复限制在 30 个字符以内；故事、谜语、笑话和菜谱请求支持完整长回复。
- 支持私聊和指定群聊，并通过稳定的微信联系人 ID 控制可响应用户。
- 支持显式授权的表情包收纳、列表、删除、随机发送和情绪匹配。
- 支持本地音乐列表、歌曲选择、随机播放和酷狗进程定时关闭。
- 支持通过 Microsoft Edge 隔离配置进行 Bing 搜索。
- 支持识别抖音分享链接并读取公开标题、简介，交给 AI 生成摘要。
- 支持聊天记忆清除、延迟消息恢复和北京时区的提醒功能。
- 使用原子 JSON 存储、备份和迁移机制保存聊天与机器人状态。
- 使用 Node.js 内置测试框架、语法检查、规则检查和 GitHub Actions CI。

## 技术栈

- Node.js 20+
- pnpm 11.9.0
- ECMAScript Modules
- Wechaty 1.20.x
- `wechaty-puppet-wechat4u`
- Kimi API / Moonshot API
- Axios、OpenAI SDK、FileBox、qrcode-terminal
- Node.js `node:test`

## 运行环境

当前项目主要面向 Windows 本地运行，部分功能依赖 Windows 软件：

- 已安装 Node.js 20 或更高版本。
- 已安装 pnpm 11.9.0。
- 已准备可用的 Kimi API Key。
- 音乐功能需要本机安装酷狗音乐，并配置正确的执行文件路径。
- 搜索功能需要本机安装 Microsoft Edge。
- 首次启动 Wechaty 时需要在终端扫描二维码；登录会话文件应只保存在本机。

## 快速开始

### 1. 安装依赖

```powershell
pnpm install --frozen-lockfile
```

### 2. 创建本地配置

PowerShell：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`，至少填写 Kimi API Key 和允许使用机器人的微信联系人 ID：

```dotenv
KIMI_API_KEY=your_kimi_api_key_here
BOUND_USER_IDS=@wxid_example
ROOM_WHITELIST=
```

`BOUND_USER_IDS` 支持用英文逗号分隔多个联系人 ID。群聊还需要同时填写群 ID，并且消息必须 @机器人。

### 3. 启动机器人

```powershell
pnpm start
```

开发模式当前与普通启动使用相同入口：

```powershell
pnpm dev
```

首次启动时，二维码只在当前终端显示，不会上传到第三方二维码服务。登录成功后，机器人会尝试复用本地会话缓存。

## 配置说明

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `KIMI_API_KEY` | 是 | Kimi/Moonshot API Key |
| `BOT_NAME` | 否 | 机器人名称，默认是“子军” |
| `BOUND_USER_IDS` | 建议 | 允许触发机器人的微信联系人 ID，支持逗号分隔 |
| `ROOM_WHITELIST` | 否 | 允许响应的微信群 ID，支持逗号分隔 |
| `KUGOU_EXE` | 否 | 酷狗执行文件路径 |
| `MUSIC_DIRS` | 否 | 要扫描的音乐目录，Windows 下使用分号分隔 |
| `MEMORY_CARD_PATH` | 否 | 微信登录会话缓存路径 |
| `BOT_STATE_DIR` | 否 | 机器人状态目录，默认是 `bot-state` |
| `STICKER_PACKS_DIR` | 否 | 表情包目录，默认是 `sticker-packs` |
| `HTTPS_PROXY` | 否 | Kimi API 使用的 HTTPS 代理 |
| `KIMI_MAX_CONCURRENCY` | 否 | Kimi 最大并发数，默认是 1 |
| `KIMI_MAX_RETRIES` | 否 | Kimi 429 最大重试次数，默认是 3 |

不要把真实 `.env`、API Key、微信登录缓存、聊天记录或个人表情包提交到 GitHub。仓库已通过 `.gitignore` 忽略这些本地数据；公开仓库只应提交 `.env.example`。

## 常用命令

```powershell
pnpm test          # 运行测试
pnpm run check     # 检查 src 下 JavaScript 语法
pnpm run lint      # 运行项目规则检查
pnpm run build     # 执行构建前检查
```

当前测试脚本覆盖消息队列、回复解析、权限控制、抖音信息读取、JSON 原子存储、会话状态、提醒逻辑、表情包行为、音乐命令和 WeChat4u 兼容错误识别。

## 可用指令示例

以下指令会根据机器人名称和当前会话权限处理：

### 对话与记忆

- 直接发送普通问题进行对话。
- `清除聊天记忆`
- `重置聊天记忆`
- `忘记聊天记忆`
- `讲一个故事`
- `猜一个谜语`
- `讲个笑话`
- `怎么做宫保鸡丁`

### 表情包

表情包收纳需要显式触发，不会自动保存普通图片：

1. 发送 `纳宝请收纳改表情包` 或 `纳宝请收纳该表情包`。
2. 回复要收纳的数量。
3. 在限定时间内发送图片或表情包。

其他示例：

- `有多少表情包`
- `发个表情包`
- `删除表情包`
- `删除全部表情包`

### 音乐

- `有什么歌曲`
- `歌曲列表`
- `随机播放`
- `播放 小半`
- 回复歌曲列表中的数字进行选择。

音乐播放功能只负责调用本地酷狗程序，不会下载或上传音乐文件。

## 项目结构

```text
.
├── .github/workflows/ci.yml       # GitHub Actions 检查流程
├── config.js                      # 本地环境变量与访问配置
├── index.js                       # 程序入口
├── scripts/                       # 测试、语法和规则检查脚本
└── src/
    ├── ai/                        # AI 编排、提示词和输出解析
    ├── chatgpt/                   # ChatGPT 兼容入口
    ├── commands/                  # 记忆、音乐、搜索、表情包命令
    ├── kimi/                      # Kimi API、历史记录和余额检查
    ├── message/                   # 消息上下文、队列和会话状态
    ├── music/                     # 本地音乐扫描与播放
    ├── search/                    # Edge 搜索和抖音页面解析
    ├── security/                  # 联系人和群聊访问策略
    ├── storage/                   # 原子 JSON 存储
    └── wechaty/                   # Wechaty 适配、提醒和表情包存储
```

消息处理链路如下：

```text
Wechaty
  -> 消息上下文
  -> 访问策略
  -> 命令识别 / 延迟队列
  -> AI 编排与外部搜索
  -> 输出解析
  -> 微信回复、历史记录和状态保存
```

## 安全与隐私

- 机器人只对配置的联系人 ID 响应，不使用昵称或备注名作为授权凭据。
- 群聊必须同时满足群白名单、绑定联系人和 @机器人条件。
- 二维码只在本地终端显示，不生成第三方二维码 URL。
- 表情包只有在用户明确触发收纳流程后才会保存。
- Kimi 错误日志会对可能出现的 Key 片段进行脱敏。
- 聊天记录、机器人状态、登录缓存和表情包默认保存在本地，并被 Git 忽略。
- 使用前请检查 `.env`、登录缓存和本地数据目录，确认没有被加入 Git 暂存区。

可以在仓库根目录检查：

```powershell
git status --short
git check-ignore -v .env bot-state sticker-packs
```

## CI

GitHub Actions 在 push 和 pull request 时执行：

1. 使用 Node.js 20 和 pnpm 11.9.0。
2. 根据锁文件安装依赖。
3. 执行测试、语法检查、规则检查和构建检查。

提交前建议本地运行：

```powershell
pnpm test
pnpm run check
pnpm run lint
pnpm run build
```

## 已知限制

- `wechaty-puppet-wechat4u` 依赖微信网页协议，可能受到微信登录策略或上游依赖变化影响。
- WeChat4u 兼容处理经过错误分类测试，但仍需要在真实微信登录和收发消息流程中验证。
- Edge 搜索和酷狗播放是 Windows 本地能力，在 Linux 或 GitHub Actions 中不代表可用。
- 抖音页面读取依赖公开页面结构，页面改版或访问限制可能导致解析失败。
- 当前状态存储使用 JSON 文件，适合个人单进程运行，不适合多实例并发部署。
- 项目没有承诺 7×24 小时运行、生产级监控或企业级数据合规能力。

## 许可证

本项目当前使用 `ISC` 许可证，具体以 `package.json` 为准。
