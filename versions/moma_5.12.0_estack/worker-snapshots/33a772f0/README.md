# 生产部署 33a772f0 的 Worker 源码输入

部署 [33a772f0-578c-48f0-ad54-334a1a2475af](https://33a772f0.moma-prototype.pages.dev) 沿用发布前的 Worker，包含渠道新建结果和返回选择恢复的前端版本。本目录保留 Worker 使用的五个共享模块。Worker 服务端源码位于本版本的 `server/`。

从仓库根目录复现发布的前端入口和 Worker。

```sh
npm ci
VITE_MOMA_PRIVATE_SITE=1 MOMA_WORKER_SNAPSHOT=33a772f0 npm run build
```

- `dist/client/_worker.js` SHA-256 `8dc5973590f9286caf4684dc34d6b67ee4d3c9834f9d4592465225d9a302941e`
- `dist/client/moma_5.12.0_estack/index.html` SHA-256 `d046f3bd973f4ca40dc34c6cc3701e9c17f3cb1fc851b862db15f481195395ec`
