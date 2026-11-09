---
id: register-layer
title: "Register access"
section: Drivers
group: Talking to hardware
source: src/topics/register-layer.ts
url: ?p=register-layer
---
# Register access

## Intro
A peripheral is controlled through registers at fixed addresses, so C needs a way to say “this address, and really do the access”. These are the three common ways to turn on one pin of an STM32’s GPIO port, and what each compiles to.

## Why volatile is there

Without it the compiler may remove or merge accesses, because as far as C knows, nothing else can see that memory. volatile says every read and write in the source must happen, in order. See volatile.

## Struct overlays

A struct with the registers in order, placed at the peripheral’s base address, gives readable code and one definition per peripheral type: GPIOA and GPIOB differ only in the base. Vendor headers are built this way. The layout must match the datasheet exactly, including any reserved gaps, which is why those headers contain padding members. See structs.

## Set and clear registers

A read-modify-write is three steps, and an interrupt between them can lose an update. Many peripherals offer a register where writing 1 acts and 0 does nothing, such as the STM32’s BSRR. The RP2040 goes further and gives most registers aliases for atomic set, clear and XOR. See read-modify-write.
