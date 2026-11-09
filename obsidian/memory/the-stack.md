---
id: stack
title: "The stack"
section: Memory
group: The call stack
source: src/topics/thestack.ts
url: ?p=stack
---
# The stack

## Intro
When one function calls another, the caller is not finished: it is waiting, partway through, for the callee to return. The stack is where each paused function’s state is kept, the return address, the registers it needs again, and its local variables, as a frame. Calls push a frame and returns pop one, always in last-in, first-out order. On a Cortex-M the stack starts at the top of SRAM and grows downward. Call and return below.

## One pointer, moved on every call

The stack is not a special kind of memory, only a convention around one register: the stack pointer, SP. To make room for a frame, a function subtracts its size from SP; to free it, the function adds it back. Everything in a frame is reached as an offset from SP (or from a frame pointer the compiler sometimes keeps as a stable reference). Because the frames are freed in the exact reverse of the order they were created, the stack never fragments: there is only ever one free edge, where SP points.

## Why it grows down

Placing the stack at the top of RAM and the program’s other data at the bottom lets the two grow toward each other and share whatever is left, instead of each needing a fixed reservation. The convention is historical as much as technical, but every Cortex-M follows it: reset loads SP from the first word of the vector table, the top of the stack, and each push moves it down.

## Running out

Nothing automatically stops the stack growing into the data below it. Deep recursion or a large local array can push SP past the bottom of its region and quietly corrupt whatever is there. Firmware guards against this by filling the stack with a known pattern and watching how much stays untouched, by placing an MPU region at the limit, or, on newer cores, with a stack-limit register that faults the instant SP crosses a set address.
