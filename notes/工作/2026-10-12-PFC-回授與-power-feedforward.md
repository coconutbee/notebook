---
title: PFC 回授與 power feedforward
date: 2026-10-12
tags:
  - PFC
  - 回授
  - power feedforward
visibility: public
updated: 2026-10-12T03:28:14.105Z
---

## 1. 系統架構與問題

```text
AC ──► PFC（1st 側, MCU）──V_bulk──► DC/DC ──[隔離]──► 2nd 側 ──► Load
              ▲                                         │
              └──────────── I_o 訊號（前饋）─────────────┘
```

測試條件：Dynamic load 以 100 Hz 在 low / high 之間切換
PFC 的 bulk 電壓上有 120 Hz ripple（60 Hz 市電的兩倍頻）
負載變動頻率（100 Hz）和 ripple 頻率很接近，傳統控制跟不上

## 2. 傳統回授：只看 V_bulk（慢）
- loading ↑ → bulk cap 放電、V_bus 下降 → PI 控制器看到 V_bus 掉 → 拉高電流命令補功率
- 問題在於 PFC 根本不知道負載功率 W_L，只能等 V_bus 掉了才反應
電壓環頻寬必須遠低於 120 Hz（否則 ripple 會被當成誤差，讓輸入電流失真、PF 變差），所以響應天生很慢
## 3. Power Feedforward（PFFD）：直接告訴 PFC 負載要多少
- 利用從LLC側量到的 I_o 估負載功率：P ≈ V_o × I_o
  - V_o 視為穩定的預設值（default steady），所以實際只需傳 I_o
  - I_o 變大或變小時，直接加進 PFC 的電流命令，不用等 V_bus 掉下來
補償器的迴授接上 I_o，可以加快響應

## 4. I_o 訊號怎麼從LLC側傳到PFC側
兩側之間隔著隔離 IC，有兩種傳法：

| 方式 | 實作 |	速度 | 用途 |
|---------|-------|-----|-----|
|EPWM| 硬體 PWM 編碼 I_o，經隔離傳送|µs 等級|即時的 I_o 前饋訊號
|UART（RX/TX）|韌體通訊|ms 等級|系統資訊、狀態，對前饋來說太慢|

## 5. 依負載變動頻率分工
|負載變動|處理方式|原因|
|---------|-------|-----|
|低頻（約 50 Hz 以上到數百 Hz）|	PFC 開啟 |power feedforward	bulk 電壓擺動大；載卸時沒有提前調整，V_bulk 容易衝過頭觸發 OVP（或掉太多UVP）|
|高頻（約 10 kHz）|F.W. bypass power feedforward|每個週期的能量很小，bulk cap 自己吸收得了，bus 自動調節；這時前饋反而會讓 PFC 跟著亂抖

## 6. PFFD 訊號的低通濾波
I_o 訊號先經過低通濾波，再送進 PFC，把截止頻率從 200 Hz 降到 2 Hz
效果：前饋量從劇烈振盪變平緩，大約 40 ms 收斂
目的：只讓「平均功率的變化」進入 PFC，不讓高頻擾動影響輸入電流
