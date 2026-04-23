# 发布说明

第一次公开发布前，以及之后每次发版前，都建议按这份清单检查。

## 人工确认项

- 确认目标 registry 上本次发布使用的包名是 `@codetypess/ecs-ts`；如果后续改名，这份清单也要一起更新。
- 第一次公开开源发布前，补上 `LICENSE` 文件，并在 `package.json` 里写对应的 `license` 字段。
- 检查 `package.json` 里的版本号，确认它是这次要发布的版本。
- 快速过一遍 `README.md` 和 `README-en.md`，确认示例和文案仍然与当前 API 一致。

## 自动化校验

发布前跑完整检查：

```sh
npm run release:check
```

这个命令会依次执行：

- 静态检查
- 单元测试
- examples 校验
- benchmark smoke
- clean build
- 包自引用 smoke test
- `npm pack --dry-run`

## 包内容检查

看一下 dry-run tarball 输出，确认：

- 只包含预期的文档和构建产物
- `dist` 里没有旧产物残留
- 包根导入能通过构建后的 `exports` 正常工作

## 发布

上面都通过后再执行：

```sh
npm publish
```

发布完成后，建议在一个干净项目里实际安装一次，再对外宣布版本。
