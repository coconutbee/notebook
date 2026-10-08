---
title: Git 基礎觀念
date: ""
tags:
  - Git
visibility: public
updated: 2026-10-08T07:52:14.550Z
---

## 四個區域

Working Directory → Staging Area → Local Repo ｜ Remote Repo

| 指令 | 方向 |
| --- | --- |
| add、mv、rm | Working Directory → Staging Area |
| reset | Staging Area → Working Directory |
| commit | Staging Area → Local Repo |
| push | Local Repo → Remote Repo |
| fetch | Remote Repo → Local Repo |
| merge | Local Repo → Working Directory |
| pull | Remote Repo → Working Directory（= fetch + merge） |
| clone | Remote Repo → Local Repo |
| checkout | Local Repo → Working Directory |

## Pull Request

我**請求**（Request）管理者 Pull 到 main branch 上。這個動作提供 discuss & review 的場所。

## Branch name

| 前綴 | 用途 |
| --- | --- |
| feature/xxx | 新功能 |
| fix/xxx | 修 bug |
| docs/xxx | 文件 |

```bash
git switch -c "branch name"
```

## Merge / Rebase

```
      A - B - C        feature
     /
D - E - F - G          main
```

Merge：

```
      A - B - C - M
     /           /
D - E - F - G ---
```

Rebase：

```
D - E - F - G - A' - B' - C'
```
