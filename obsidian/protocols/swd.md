---
id: swd
title: "SWD"
section: Protocols
group: Debug & programming
source: src/protocols/swd.ts
url: ?p=swd
---
# SWD
*Serial Wire Debug (Arm)*

## Summary
Arm's two-pin alternative to JTAG for debugging and programming microcontrollers. The debugger sends an 8-bit request that names a register, and a turnaround cycle hands control of the data line to the target, which responds with a 3-bit acknowledge. Then 32 bits of data and a parity bit travel in one direction or the other.

## Used in
Programming and debugging almost every Arm Cortex-M microcontroller (STM32, nRF52, RP2040 and others) through ST-Link, J-Link or CMSIS-DAP probes.

**Tags:** synchronous, single-ended, push-pull, half duplex, point-to-point, debug

## At a glance
- **Clock:** Synchronous. The debugger drives SWCLK. It changes SWDIO on the falling edge and the target samples on the rising edge; the target changes SWDIO on the rising edge and the debugger samples on the falling edge.
- **Wires:** SWCLK and SWDIO, plus ground. An optional SWO pin streams trace output.
- **Drive:** Push-pull, with a pull-up on SWDIO. Whenever the direction changes, a turnaround cycle is inserted during which no device drives the line.
- **Duplex:** Half duplex on the single SWDIO wire.
- **Topology:** Point-to-point: one probe, one chip. SWD version 2 adds a multi-drop mode.
- **Addressing:** Each request picks the debug port (DP) or an access port (AP) and one of four registers. The DP's SELECT register chooses which AP and register bank.
- **Flow control:** The target can answer WAIT, and the debugger retries the request.
- **Error checking:** An even-parity bit on every request and every 32-bit data word, and a FAULT ACK when something went wrong.
- **Speed:** Typically 1 to 10 MHz, and up to about 50 MHz with fast probes.
- **Reach:** A short cable from the debug probe to the board.

## Strengths
- Only two pins, versus four or five for JTAG, with the same debug access on Arm chips.
- ACKs and parity make it more robust than raw JTAG.
- Supported by practically every Cortex-M chip and every Arm debug probe.

## Limits
- Arm only.
- No daisy chain (outside SWD v2 multi-drop) and no boundary scan.
- A packet spends several clocks on the request, turnarounds and ACK for every 32-bit access.

## Settings
- **Operation** — Whether the debugger reads a register or writes one.
- **Port** — The debug port (DP) manages the connection itself; an access port (AP) leads to the memory and peripherals of the processor.
- **Register** — The register address within the selected port. On the debug port, a read of 0x0 returns DPIDR, the identification register.
- **Data** — The 32-bit value read or written, in hexadecimal.
- **Target answers** — The response of the target. OK accepts the request, WAIT asks the debugger to retry, and FAULT reports an earlier error. No data phase follows WAIT or FAULT.

## Going deeper
### Line reset and switching from JTAG
Most Arm debug ports accept both JTAG and SWD on shared pins (SWJ-DP) and start in JTAG mode. To switch, the debugger sends at least 50 clocks with SWDIO high (a line reset), the 16-bit sequence 0xE79E, and another line reset. The first transaction after that must read DPIDR; until it does, the debug port ignores other requests.
Newer debug ports start in a dormant state and are activated by a 128-bit selection alert sequence instead.
### Debug port and access ports
The debug port (DP) handles the link: DPIDR identifies it, CTRL/STAT requests debug and system power-up and reports errors, and SELECT chooses an access port (AP) and register bank. A memory access port (MEM-AP) then provides access to the processor's memory map: write an address to TAR, then read or write DRW. Every register, peripheral and flash controller is reachable this way.
### Posted AP reads
Reads from an access port are posted: the value returned by an AP read is the result of the previous AP read. The first AP read in a sequence therefore returns stale data, and the result of the last read is obtained by reading the DP's RDBUFF register. Debug tools account for this automatically, but it is a common source of confusion when interpreting captured traffic.
### WAIT, FAULT and sticky errors
A WAIT acknowledge means the previous access has not completed, for example while a slow bus transaction is in progress, and the debugger should repeat the request. FAULT means an error flag, such as STICKYERR, is set in CTRL/STAT. Every subsequent access faults until the debugger clears the flag by writing to the ABORT register.
### SWO trace output
SWO is an optional third pin that streams trace data from the core, most often instrumentation trace (ITM) output used for printf-style logging without a UART. It runs independently of SWDIO and SWCLK, using UART-style or Manchester encoding.
### Multi-drop SWD
SWD version 2 allows several targets on one SWDIO/SWCLK pair. After a line reset, the debugger writes the DP's TARGETSEL register to select one target, and the others remain inactive. The RP2040, for example, uses multi-drop SWD to expose its two cores and a rescue debug port.
