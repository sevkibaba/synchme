# Beatmatch & Nudge Synchronization Architecture

## Overview
This document summarizes the synchronization, nudge, and compensation architecture implemented in `synchme` to achieve sub-millisecond audio alignment across iOS devices connected over Bluetooth Low Energy (BLE).

---

## Key Parameters

| Parameter | Value | Description |
| :--- | :--- | :--- |
| **Nudge Step (`offsetMs`)** | `1ms` (`0.001s`) | Step size per manual nudge button press (`<<<` or `>>>`). |
| **Default Compensation Delay** | `90ms` (`0.090s`) | Initial estimate for native iOS audio decoder restart freeze time. |
| **Extra Forward Buffer** | `50ms` (`0.050s`) | Additional buffer to compensate for native hardware audio queue resume latency. |
| **Sync Interval** | `3000ms` | Host broadcasts `SYNC` payload (`trueHostTime`) every 3 seconds. |
| **Clock Offset Ping Count** | `5 pings` | Averages the top 3 lowest RTT pings to establish `clockOffset`. |
| **In-Sync Threshold** | `1ms` | Threshold within which Guest is considered `In Sync` (`#2a7a2a`). |
| **BLE Play Buffer** | `150ms` | Minimal wait buffer scheduled when Host triggers `PLAY`. |

---

## Synchronization Architecture

```
 Host Device (Peripheral)                        Guest Device (Central)
 ------------------------                        ----------------------
   Host Wall Clock (Date.now())  <-- Ping/Pong -->   Guest Wall Clock (Date.now())
                |                                                  |
                v                                                  v
     trueHostTime (Date.now())                    clockOffset = hostTime - guestTime
                |                                                  |
     Broadcast SYNC (every 3s)  ---------------->  lastSyncRef = { hostTime, localTimeAtSync }
```

### 1. Clock Alignment (`clockOffset`)
Upon connection, Guest executes 5 rapid RTT pings to Host:
$$\text{offset} = \text{hostTime} - \left(\text{Date.now()} - \frac{\text{RTT}}{2}\right)$$
The 3 pings with lowest RTT are averaged into `clockOffset`.

### 2. True Host Position Calculation
Guest calculates True Host Position at any wall clock instant $t$:
$$\text{trueHostPos} = \text{lastSyncRef.hostTime} + \frac{t - \text{lastSyncRef.localTimeAtSync}}{1000}$$

### 3. Manual Nudge Offset (`nudgeOffsetRef`)
Manual Nudge adjustments accumulate in `nudgeOffsetRef.current`:
$$\text{targetGuestPos} = \text{trueHostPos} + \text{nudgeOffsetRef.current}$$
- Pressing `>>>` adds `+0.001s` (nudge forward).
- Pressing `<<<` subtracts `-0.001s` (nudge backward).

---

## Compensated `seekTo` Logic

To prevent native iOS audio hardware stutter from causing the Guest to fall behind during a seek:

1. **Calculate Target Position with Compensation:**
   $$\text{compensationSecs} = \frac{\text{lastSeekComputeDelayRef}}{1000} + 0.050\text{s}$$
   $$\text{targetPos} = \max\Big(0, \text{trueHostPos} + \text{nudgeOffsetRef.current} + \text{compensationSecs}\Big)$$

2. **Execute Precise Seek:**
   $$\text{seekStart} = \text{performance.now}()$$
   $$\text{player.seekTo}(\text{targetPos}, 0, 0)$$
   $$\text{actualFreeze} = \text{performance.now}() - \text{seekStart}$$

3. **Update Moving Average:**
   $$\text{lastSeekComputeDelayRef} = (\text{lastSeekComputeDelayRef} \times 0.7) + (\text{actualFreeze} \times 0.3)$$

4. **Calibrate Reference Time:**
   $$\text{lastSyncRef.localTimeAtSync} = \text{resumeTime}$$
   $$\text{lastSyncRef.hostTime} = \text{trueHostPos} + \frac{\text{resumeTime} - \text{pressTime}}{1000}$$

---

## Visual Cues & Indicator Logic

Guest compares `targetGuestPos` against current Guest position ($\text{guestPos}$):
$$\Delta_{\text{ms}} = (\text{targetGuestPos} - \text{guestPos}) \times 1000$$

- $\Delta_{\text{ms}} > +1\text{ms}$: **Guest Behind** $\rightarrow$ Highlight `>>>` (Green `#2a8a2a`), Hint: `⚠️ Guest is behind — press >>>`
- $\Delta_{\text{ms}} < -1\text{ms}$: **Guest Ahead** $\rightarrow$ Highlight `<<<` (Red `#cc3333`), Hint: `⚠️ Guest is ahead — press <<<`
- $-1\text{ms} \le \Delta_{\text{ms}} \le +1\text{ms}$: **In Sync** $\rightarrow$ Both Buttons Green (`#2a7a2a`), Hint: `✅ In sync!`
