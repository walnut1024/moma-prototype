# 生产部署 7e451843 的 Worker 源码输入

Cloudflare Pages 部署 `7e451843-8c44-4dab-a667-a8f4a030c1a5` 使用该提交的前端源码，并沿用部署 `16cc0a58-dc40-499c-b9e9-027c58efdfa2` 的 Worker。本目录保留两次构建中版本不同、且会影响 Worker 字节的五个共享文件。Worker 服务端源码位于版本的 `server/` 目录。

从仓库根目录重建该生产组合。

```sh
npm ci
VITE_MOMA_PRIVATE_SITE=1 MOMA_WORKER_SNAPSHOT=7e451843 npm run build
```

预期 `dist/client/_worker.js` 的 SHA-256 为 `e874bb9200d68d41b81c7fe240e7c5aa16b562836fafeef3493574310e0ec945`。版本入口 `dist/client/moma_5.12.0_estack/index.html` 的 SHA-256 为 `53ea5d453889b49622b9659c4e0886061d916e1951bdf90c6ff520fe5418c189`。

该选项用于复现这次生产部署。日常开发构建直接使用当前工作树的源码。
