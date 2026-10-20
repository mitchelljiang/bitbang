---
id: races
title: "Race conditions"
section: Concurrency
group: Sharing data safely
source: src/topics/races.ts
url: ?p=races
---
# Race conditions

## Intro
Two tasks share a counter, and each adds one to it. In C that is one line, count++, but the processor does it in three instructions: load, add, store. A task can be switched out between any two of them. Here you are the scheduler: run the next instruction of A or of B in whatever order you like, and watch what reaches memory.

## Read, modify, write

An ARM core cannot add to memory directly. To increment a variable it loads it into a register, adds in the register, and stores it back. Between the load and the store the true value lives only in that task’s register, invisible to everyone else. If another task loads the variable in that window, both start from the same old value and both store the same new one, and one increment vanishes. Each task has its own r0 because the context switch saves and restores it, which is exactly why the two copies can disagree.

## Why races are hard to find

Of the 20 ways to interleave these six instructions, only 2 give the right answer: those where one task finishes before the other starts. Yet in a real system the window is a couple of nanoseconds wide, and a switch lands in it rarely. The code passes every test, then fails once a week in the field. The same race happens between a task and an interrupt handler, or between two cores, and with any shared read-modify-write: setting a bit in a flags word, appending to a buffer, updating a linked list.

## The fix is to make it indivisible

The cure is to make the whole read-modify-write happen as one step that nothing can split, either by stopping anything else from running during it, or by using an instruction sequence that detects interference and retries. That is the next page: atomics and critical sections.
