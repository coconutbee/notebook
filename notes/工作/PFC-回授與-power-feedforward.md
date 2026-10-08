---
title: PFC 回授與 power feedforward
date: ""
tags:
  - PFC
  - 回授
  - power feedforward
visibility: public
updated: 2026-10-08T07:47:45.471Z
---

（手繪：AC → PFC 120 Hz —— Dynamic load 100 Hz，load 的 low / high 回饋給 PFC）

## 回授

loading ↑ ⇒ bulk cap. discharge →（PI Control，看 V_bulk）→ 補工

## Power feedforward

- PFC can't know W_L（負載功率）
- 電流環：I_o ↑↓ 回饋給 PFC
- I_o、V_o（default steady）
- EPWM：訊號（硬體），µs 等級 → I_o signal
- RT/TX（UART）：1 ms → 系統

## 響應速度

—— bus load ↑ —— 響應

（手繪：1st（PFC / MCU）—[iso, IC]— 2nd，50 Hz ↑）

- High freq. 10 kHz：F.W. bypass power feedforward，bus 自動調節
- 前面 PFC 要 power feedforward，避免 OVP 撐不住，後面再 bypass
- PFFD：200 Hz → 2 Hz low pass，約 40 ms（手繪：波形由劇烈振盪逐漸平緩）
- 補償器迴授接 I_o，加速響應
