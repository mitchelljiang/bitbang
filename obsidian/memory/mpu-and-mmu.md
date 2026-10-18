---
id: mpu
title: "MPU and MMU"
section: Memory
group: Virtual memory
source: src/topics/mpu.ts
url: ?p=mpu
---
# MPU and MMU

## Intro
Not every processor has an MMU, but many have a lighter cousin: the Memory Protection Unit. It does not translate addresses, so there is still one address space; it only enforces rules on it. A handful of regions each say what range they cover and who may read, write or execute there, and any access that breaks a rule, or falls outside every region, faults instead of going through. Choose an access below and see which region decides its fate.

## Protection without translation

The MPU is the cheap half of memory protection: no page tables, no TLB, no translation, just a comparator per region that checks each access against a base, a size and a permission set. That is enough to give an operating system real teeth on a microcontroller. User tasks run unprivileged and are boxed into their own regions, so a bug in one cannot scribble over the kernel, another task, or the peripherals; only privileged code can. It is the same idea as an MMU’s isolation, minus the address translation and the ability to oversubscribe memory.

## Catching bugs at the source

Because a violation faults immediately, the MPU turns whole classes of silent corruption into a precise, reported error. Marking Flash read-only catches a wild pointer that tries to overwrite code; marking RAM execute-never stops a buffer overflow from running data as instructions; a no-access region just below each task’s stack catches a stack overflow the instant it crosses the line. The fault handler gets the faulting address and can log it or kill the offending task instead of letting the damage spread.

## Regions, alignment and priority

The trade-off is coarseness. A classic Cortex-M MPU offers only a handful of regions (often eight), and each must be a power-of-two size aligned to its own size, so protection is laid out in blocks, not bytes. Where regions overlap, the highest-numbered one wins, which is exactly how the stack guard here sits inside the larger RAM region and overrides it. The newer Armv8-M MPU drops the power-of-two rule for simple base-and-limit regions, but the model, check every access against a small set of ranges, is the same.
