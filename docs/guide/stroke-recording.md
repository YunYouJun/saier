---
title: 笔迹录制与回放
---

# 笔迹录制与回放

Saier 的工程文件保存最终像素，笔迹日志（`saier.stroke-log.v1`）则记录“怎样画出来”：文档坐标、压感、倾角、时间、笔刷快照和目标图层。二者用途不同；需要可靠恢复作品时保存工程文件，需要教学回放、问题复现或协作操作流时再保存笔迹日志。

## 在在线画板中使用

1. 点击工具栏中的录制按钮，按钮提示从“开始笔迹录制”变为“停止笔迹录制”。
2. 正常绘制。只有开启录制后完成的笔迹会进入当前日志，工具栏会显示已记录数量。
3. 点击停止录制，避免把后续编辑继续写入同一段日志。
4. 点击回放控制条的“回到开头”，再点击“播放”；也可以拖动位置、逐笔前进或调整速度。
5. 回放会覆盖显示一个独立预览，并按每个 point / tick 的原始时间播放，不会给当前工程增加像素或撤销记录。点击“关闭回放预览”返回编辑画布。

控制条没有笔迹时会提示“先开启录制，再绘制笔迹即可回放”。直接在未清空的原画布上重复绘制相同笔迹通常看不出变化，因此回放必须从录制开始时捕获的基线快照，在临时 Painter 中重建。

录制关闭期间发生的绘制、图层增删或滤镜操作不会进入 stroke log。若中途做了这类编辑，请先清空上一段录制，再重新开启录制，让界面以最新工程建立新的基线；仅暂停观看、未修改工程时可以继续沿用当前录制段。

## 导出与导入

“导出笔迹日志”生成 `.saier.strokes.json`。日志不是完整工程文件；要在另一台设备或以后准确重放，请同时保存录制开始时对应的 `.saier` 工程快照。

导入时先打开对应的基线工程，再导入笔迹日志。界面会把当前工程作为回放基线，并将日志中的缺失图层目标回退到当前可绘制图层。笔刷引擎 major 版本不兼容、缺少自定义 engine，或 sampler 笔刷没有可读 surface 时，语义回放可能失败；最终作品仍应以工程快照为准。

## 运行时 API

录制是 opt-in 的：

```ts
const painter = createPainter({ view: canvas, backend: 'tiled' })
await painter.init()

painter.strokeRecording.setEnabled(true)
// 用户在这里绘制；runtime 会记录 stabilizer 之后的 canonical events。
painter.strokeRecording.setEnabled(false)

const log = painter.strokeRecording.getLog()
```

恢复或测试可同步重放；有可见动画的预览应使用独立 Painter 和 timed API：

```ts
previewPainter.strokeRecording.replayLog(log, { recordHistory: false })

await previewPainter.strokeRecording.replayStrokeTimed(stroke, {
  speed: 1,
  recordHistory: false,
  signal: abortController.signal,
})
```

不要把 replay 写回正在编辑的 Painter。正确的 timelapse 流程是“导入基线工程到临时 Painter → 按 revision 应用已完成操作 → 按事件时间播放当前笔迹 → 丢弃临时 Painter”。协议、确定性边界和协作 fallback 详见[笔迹录制与回放设计](/design/stroke-recording)。
