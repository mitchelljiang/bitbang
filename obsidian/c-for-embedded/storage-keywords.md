---
id: keywords
title: "Storage keywords"
section: C for embedded
group: Variables and types
source: src/topics/keywords.ts
url: ?p=keywords
---
# Storage keywords

## Intro
Where a variable is declared, and with which keyword, decides two things: where it is stored, and which code can see it. Here is one counter declared six ways, compiled by Clang for a Cortex-M0+ at -Os. The heading on the right says where it ended up, from the object file’s symbol table.

## Where variables live

A local variable exists only while its function runs: in a register, or in the function’s stack frame. Everything declared outside a function, or with static inside one, exists for the whole program and has a fixed address. The linker gives it one in SRAM: in .data if it has a starting value, which startup copies from Flash, or in .bss if it starts at zero, which startup clears. A const global goes in Flash, which on a microcontroller is usually much larger than SRAM. The sections page shows the copy and the clear.

## Who can see a name

static means two different things. Outside a function it limits a name to its own file, so two files can each have a static int count without clashing; this is C’s only privacy. Inside a function it means the variable outlives the call. extern says a variable is defined somewhere else: put extern declarations in a header, and the one definition in one .c file.

## const is not a promise about the hardware

const says this code will not write the object. It can still change in other ways: a const volatile register, such as a read-only status register, is one the program may not write but the hardware changes all the time. For that, see volatile.
