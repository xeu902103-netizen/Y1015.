网址:https://290118.xyz

# 音乐下载器 · Cloudflare Worker 版

和 PHP 版功能一致，但跑在 Cloudflare 边缘：**不需要服务器、不需要数据库、免费额度够个人用**。

- 网易云：扫码登录（同机点按钮唤起 App）、搜索、单曲、歌单、音质选择
- QQ 音乐：搜索、单曲链接、歌单链接、音质（128k / 320k / 无损），需要粘贴 Cookie
- 酷狗：搜索、免费歌曲直接下，会员歌曲需要 Cookie
- 登录态用**签名串存在浏览器**（localStorage + `X-Sess` 头），Worker 不存任何数据
- 下载走 **302 直连音乐 CDN**，不占用 Worker 流量

## 文件

| 文件 | 说明 |
| --- | --- |
| `worker.js` | Worker 主程序（已内嵌二维码库、MD5、AES-ECB，单文件） |
| `wrangler.toml` | Cloudflare 配置 |
| `page.html` / `worker.template.js` / `build.mjs` | 源码与构建脚本（改页面后跑 `node build.mjs` 重新生成 `worker.js`） |


## 赞赏码图片（微信 / 支付宝）

赞赏码图片**已经内嵌在 `worker.js` 里**（`/1` = 微信，`/2` = 支付宝），不用再建 `public/` 目录，也不会因为缺目录而构建失败。

想换成自己的图，两种办法：

1. 仓库里建 `public/` 目录，放 `1.png`、`2.png`，然后把 `wrangler.toml` 里被注释的 `[assets]` 三行放开
2. 或者重新生成 `worker.js`（跑 `node build.mjs`，图片放 `assets/1.webp`、`assets/2.jpg`）

## 网易云扫码登不上怎么办

1. 打开 `你的域名/?a=diag`，看 `netease_api` 和 `raw_status`
2. 页面里二维码下方有「就在这台手机上登录」（直接唤起 App 确认，不用别的设备扫）
3. 还不行就用 Cookie 兜底：在网易云网页版登录后复制 `MUSIC_U=...`，粘到「改用 Cookie 登录」里

## 方式一：GitHub → Cloudflare（自动部署）

1. 新建 GitHub 仓库，把 `worker.js`、`wrangler.toml` 推上去即可（两个文件就够）

```bash
git init
git add worker.js wrangler.toml
git commit -m "music downloader worker"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

2. 打开 Cloudflare 控制台 → **Workers & Pages** → **Create** → **Workers** → **Connect to Git**
3. 选刚才的仓库，构建命令留空（或填 `npx wrangler deploy`），部署命令用默认
4. 保存后每次 `git push` 都会自动重新部署，得到一个 `https://<项目名>.<你的子域>.workers.dev` 地址，手机直接打开就能用

> 如果控制台提示需要构建命令，填：`npx wrangler deploy`（`wrangler.toml` 里已经写好 `main = "worker.js"`）

## 方式二：命令行直接部署

```bash
npm i -g wrangler
wrangler login
wrangler deploy
```

## 自定义域名

Workers 项目 → Settings → Domains & Routes → Add custom domain，绑定自己的域名即可（Cloudflare 托管的域名一条命令搞定）。

## 注意

- **免费额度**：10 万次请求/天、CPU 10ms/次。搜索和取地址足够；因为下载是 302 跳转，不会经过 Worker 转发大文件。
- 如果某个平台直链需要 Referer 才能下（少数情况），可以改成 Worker 转发（会消耗流量，代码里 `?a=download` 处可切换）。
- `worker.js` 里的 `SESS_SECRET` 建议改成你自己的随机字符串（登录态签名用），改了之后已登录的用户需要重新登录。
- 各平台接口都是非公开接口，随时可能变；搜不到就打开 `?a=diag` 看是哪一步挂了。
