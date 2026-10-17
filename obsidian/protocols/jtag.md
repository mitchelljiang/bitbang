---
id: jtag
title: "JTAG"
section: Protocols
group: Debug & programming
source: src/protocols/jtag.ts
url: ?p=jtag
---
# JTAG
*Joint Test Action Group (IEEE 1149.1)*

## Summary
A standard port for testing and debugging chips. Every JTAG device contains the same 16-state controller, the TAP, which the TMS line steps through one TCK clock edge at a time. In two of its states, Shift-IR and Shift-DR, a shift register connects TDI to TDO, so a bit is shifted in as another is shifted out. Shifting into the instruction register selects an operation, and shifting through a data register carries it out.

## Used in
Programming and debugging microcontrollers, CPUs and FPGAs, and boundary-scan testing of solder joints on assembled boards.

**Tags:** synchronous, single-ended, push-pull, full duplex, daisy chain, chip-to-chip, debug

## At a glance
- **Clock:** Synchronous. The debugger drives TCK. TMS and TDI are sampled on the rising edge, and TDO changes on the falling edge.
- **Wires:** TCK, TMS, TDI and TDO, plus an optional TRST reset line and ground.
- **Drive:** Push-pull. TDO is only driven in the Shift-IR and Shift-DR states and is high-Z the rest of the time.
- **Duplex:** Full duplex while shifting: one bit goes in on TDI as one comes out on TDO.
- **Topology:** Daisy chain: TDO of each chip feeds TDI of the next, and they all share TCK and TMS.
- **Addressing:** None. Chips in a chain are told apart by position; devices not being accessed are given the 1-bit BYPASS instruction.
- **Flow control:** None. The debugger sets the pace, and TMS alone decides what the chips do next.
- **Error checking:** None in the protocol. Tools sanity-check the chain by reading IDCODEs and watching for the known patterns the standard requires.
- **Speed:** TCK from about 1 to 50 MHz, limited by the slowest chip in the chain and the cable.
- **Reach:** A short ribbon cable from the debug probe to the board.

## Strengths
- One standard port for testing, debugging and programming almost any complex chip.
- Many chips can share four wires in one chain.
- Boundary scan can test the connections on a board without running any code on it.

## Limits
- Requires four or five pins, a significant cost on a small microcontroller (the motivation for SWD).
- Every access spends extra clocks walking the state machine.
- A chain runs at the speed of its slowest chip, and one dead chip breaks the whole chain.
- The instructions used for debugging and flash programming are vendor-specific.

## Settings
- **IDCODE** — The 32-bit IDCODE the device returns, in hexadecimal. Bit 0 must be 1. The default, 4BA00477, identifies an Arm Cortex-M debug port.
- **Sequence** — The first sequence reads IDCODE directly, because reset selects it automatically. The second first shifts an instruction into the instruction register, as a debugger does to select any operation.
- **Instruction** — The instruction to load, in hexadecimal, for a 4-bit instruction register. Used only by the second sequence; 0xE selects IDCODE on Arm debug ports.
- **TCK** — The TCK frequency. It changes the timescale, not the sequence.

## Going deeper
### Boundary scan
JTAG was created for testing assembled boards. Every pin of a compliant chip has a boundary-scan cell that can capture the pin's state or override it. With the EXTEST instruction, a tester drives values onto one chip's pins and reads them on another's, verifying each solder joint and trace without running any firmware. BSDL files describe each chip's boundary-scan cells for test software.
### Required instructions
IEEE 1149.1 requires BYPASS, SAMPLE/PRELOAD and EXTEST. BYPASS must use the all-ones opcode and selects a 1-bit data register, which shortens the chain through devices that are not being accessed. IDCODE is optional but nearly universal, and a device that implements it selects it automatically on reset.
### Scanning a chain
In a chain, the instruction register lengths add up, and every IR scan must shift a full instruction into every device. To access one device, a debugger places the others in BYPASS, so each contributes a single bit to the data path.
After reset, a DR scan reads every device's IDCODE back to back. Because every IDCODE ends in a 1 and every BYPASS register captures a 0, a debugger can count the devices and identify each one.
### Debug and programming
Debug access is built on vendor-defined instructions. On Arm processors, the JTAG-DP uses DPACC and APACC instructions to reach the same debug access port that SWD uses. RISC-V cores expose a debug transport module, and FPGAs load configuration bitstreams through dedicated JTAG instructions.
### Adaptive clocking
Some older Arm cores synchronize JTAG to their own clock and return a copy of TCK on an RTCK pin. A debugger using adaptive clocking waits for each RTCK edge before continuing, so it never runs faster than the core can follow, which matters when the core runs from a slow clock.
### Fewer pins: cJTAG
IEEE 1149.7, compact JTAG, carries the same TAP operations over two pins, TCKC and TMSC, by multiplexing TMS, TDI and TDO onto a single bidirectional line. It addresses the same pin-count problem as SWD, on non-Arm devices as well.
