# 中文自动化变更记录

## [Unreleased]

### Added

- 自动跟随 OMP 官方稳定版，复用已有中文译文并使用可配置模型补译新增界面文案，通过校验后生成中文源码和 Windows 运行包。

### Fixed

- Windows CLI 构建使用独立缓存和文件复制，避免汉化写入影响 Bun 的原始依赖缓存。
- Windows CLI 安装优先使用系统 tar 解压依赖文件，减少安装等待时间。
