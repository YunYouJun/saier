---
title: Performance Baseline
---

# Performance Baseline

Run the tiled backend benchmark explicitly when updating public beta baseline records:

```bash
pnpm perf:baseline
```

The command drives `examples/vue/perf-baseline.html` with Playwright and writes:

- `latest.json` — structured baseline data
- `latest.md` — human-readable report
- `latest.png` — screenshot of the report page

The spec is skipped during normal `pnpm test:e2e` runs unless `SAIER_PERF_BASELINE=1` is set, because throughput and long-session measurements are machine-dependent and slower than smoke tests.

The benchmark records 1024² and 4096² canvases with the tiled backend, including actual painted dab count, dab throughput, allocated tile count, upload count, memory estimates, and repeated-stroke stability samples after undo history reaches capacity.
