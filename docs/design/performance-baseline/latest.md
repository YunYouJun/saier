---
title: Performance Baseline Latest
---

# Performance Baseline Latest

Generated: `2026-07-06T08:29:40.721Z`

User agent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.55 Safari/537.36`

Device pixel ratio: `1`

Run command: `pnpm perf:baseline`

![Performance baseline screenshot](./latest.png)

## Summary

| Case        |  Dabs | Duration |  Dabs/s | Tiles | Uploads |  Surface |     Undo |    Total | Stable Drift |
| ----------- | ----: | -------: | ------: | ----: | ------: | -------: | -------: | -------: | -----------: |
| 1024 x 1024 | 13140 | 659.2 ms | 19933.3 |     4 |     128 | 2.00 MiB | 50.0 MiB | 52.0 MiB |          0 B |
| 4096 x 4096 | 13140 | 636.7 ms | 20637.7 |     4 |     128 | 2.00 MiB | 50.0 MiB | 52.0 MiB |          0 B |

## 1024 x 1024 Stability Samples

| Strokes | Undo Count | Tiles |  Surface |     Undo |    Total |
| ------: | ---------: | ----: | -------: | -------: | -------: |
|       4 |          4 |     4 | 2.00 MiB | 8.00 MiB | 10.0 MiB |
|       8 |          8 |     4 | 2.00 MiB | 16.0 MiB | 18.0 MiB |
|      12 |         12 |     4 | 2.00 MiB | 24.0 MiB | 26.0 MiB |
|      16 |         16 |     4 | 2.00 MiB | 32.0 MiB | 34.0 MiB |
|      20 |         20 |     4 | 2.00 MiB | 40.0 MiB | 42.0 MiB |
|      24 |         24 |     4 | 2.00 MiB | 48.0 MiB | 50.0 MiB |
|      28 |         25 |     4 | 2.00 MiB | 50.0 MiB | 52.0 MiB |
|      32 |         25 |     4 | 2.00 MiB | 50.0 MiB | 52.0 MiB |

## 4096 x 4096 Stability Samples

| Strokes | Undo Count | Tiles |  Surface |     Undo |    Total |
| ------: | ---------: | ----: | -------: | -------: | -------: |
|       4 |          4 |     4 | 2.00 MiB | 8.00 MiB | 10.0 MiB |
|       8 |          8 |     4 | 2.00 MiB | 16.0 MiB | 18.0 MiB |
|      12 |         12 |     4 | 2.00 MiB | 24.0 MiB | 26.0 MiB |
|      16 |         16 |     4 | 2.00 MiB | 32.0 MiB | 34.0 MiB |
|      20 |         20 |     4 | 2.00 MiB | 40.0 MiB | 42.0 MiB |
|      24 |         24 |     4 | 2.00 MiB | 48.0 MiB | 50.0 MiB |
|      28 |         25 |     4 | 2.00 MiB | 50.0 MiB | 52.0 MiB |
|      32 |         25 |     4 | 2.00 MiB | 50.0 MiB | 52.0 MiB |
