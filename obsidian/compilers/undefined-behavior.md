---
id: ub
title: "Undefined behavior"
section: Compilers
group: Optimization
source: src/topics/ub.ts
url: ?p=ub
---
# Undefined behavior

## Intro
Some operations in C have no defined result: signed overflow, reading through a null pointer, indexing past the end of an array, and a few dozen more. The compiler is allowed to assume they never happen, and the optimizer uses that freely. The result is code that drops your checks. Compare each bug with its fix.

## Why the compiler is allowed

The standard says that when a program does something undefined, it places no requirement at all on what happens. So the compiler only has to get the defined cases right, and it reasons backwards from there: if x + 1 cannot overflow, it is always bigger than x; if *p already ran, p was not null. Each step is sound for every program without undefined behavior, and the optimizer makes thousands of them. They are what makes C fast, and why one bug can remove code far from the line where it happens.

## Common cases in firmware

- Signed overflow. int arithmetic that wraps. Unsigned arithmetic wraps by definition and is safe; for signed, check before the operation or use __builtin_add_overflow. See overflow and status flags.
- Shifts. Shifting by the width of the type or more, as in 1u << 32, or shifting a 1 into the sign bit of an int, as in 1 << 31. Write 1u << 31.
- Out-of-bounds access and uninitialized local variables.
- Type punning through pointers, such as reading a float through a uint32_t *. Use memcpy, which the compiler turns into a plain load.
- Data races: two threads, or a thread and an interrupt, using the same non-atomic variable without a lock.

## Finding it

Build tests on a PC with -fsanitize=undefined,address, which checks every one of these as the program runs. -Wall -Wextra catches some at compile time. GCC and Clang also offer -fwrapv, which defines signed overflow to wrap, at a small cost in speed.
