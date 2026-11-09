---
id: cells
title: "SRAM, DRAM and Flash"
section: Memory
group: Memory hardware
source: src/topics/cells.ts
url: ?p=cells
---
# SRAM, DRAM and Flash

## Intro
Every memory stores a bit somehow, and the three in a typical system each make a different trade. SRAM holds a bit in a tiny latch: fast, but six transistors wide. DRAM uses one transistor and a capacitor: dense and cheap, but the charge leaks and must be topped up constantly. Flash traps charge on an insulated gate that survives power loss, but wears out and erases only in big blocks. Pick one and see how it holds, or loses, a bit.

## Why a computer uses all three

No one cell wins on every axis, so a system layers them. SRAM is fastest and needs no refresh, but at six transistors a bit it is too big to build much of, so it is reserved for caches and a microcontroller’s on-chip RAM. DRAM packs far more bits per area, which is why gigabytes of main memory are DRAM, and the cost is a memory controller that quietly rewrites every row every few milliseconds. Flash keeps its contents with the power off, so it holds the program and the filesystem, at the price of slow, block-sized writes and a limited number of erases.

## Why DRAM forgets

A DRAM bit is just charge on a capacitor so small it drains through leakage in milliseconds. The controller reads every row and writes it straight back, a refresh, often enough that no bit fades, typically all rows within 64 ms. Refresh costs power and steals a little bandwidth, and it is why DRAM loses everything the instant the power, and the refresh, stop. SRAM does not leak because its latch actively drives the bit as long as it is powered, but it forgets just as completely when the power goes.

## Why Flash wears out and erases in blocks

Writing Flash forces charge through an insulator onto the floating gate; erasing pulls it back off. Each pass damages the insulator a little, so a cell tolerates only tens of thousands of erase cycles before it can no longer hold a clean level. And erasing only works on a whole block at once: you can program individual bits from 1 to 0, but to set any bit back to 1 you must erase the entire block. That asymmetry is why SSDs and flash filesystems run wear levelling, spreading writes so no one block is erased to death while others sit idle.
