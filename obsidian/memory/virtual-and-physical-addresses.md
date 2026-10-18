---
id: vaddr
title: "Virtual and physical addresses"
section: Memory
group: Virtual memory
source: src/topics/vaddr.ts
url: ?p=vaddr
---
# Virtual and physical addresses

## Intro
On a desktop or phone, the address a program uses is not the address in the memory chips. Each program runs in its own virtual address space, starting at the same low addresses as every other, and the memory management unit translates each access to a real physical address as it happens. So two programs can both use 0x0000 and never clash: the MMU sends each to different physical memory. A microcontroller has no MMU, so there the two are the same. Pick a page in either process.

## What the translation buys

Three things, all from the same mechanism. Isolation: a program can only name addresses in its own map, so it physically cannot read or corrupt another’s memory, no matter what pointer it builds. Flexibility: the physical frames behind a program need not be contiguous or even all present, which is what lets the operating system hand out memory in scattered frames and move it around. Sharing: pointing two maps at the same frame, as A’s page 0 and B’s page 1 are here, shares memory deliberately, which is how shared libraries live in physical memory once and appear in every process.

## Pages, not bytes

Translation works a page at a time, not a byte at a time, or the map would be as large as the memory it describes. The low bits, the offset within a page, pass through untouched; only the high bits, the page number, are looked up and replaced with a frame number. With 4 KB pages that is the low 12 bits carried through and the rest translated. The lookup table itself, the page table, is what the next page is about.

## When a page is not mapped

A virtual page with no frame behind it, like A’s page 2 here, causes a page fault on access. That is not always an error: the OS uses it deliberately, to load a page from disk on first use (demand paging), to grow the stack, or to copy a shared page only when it is first written. A fault that corresponds to nothing valid is the segfault a buggy program earns. A microcontroller has no such net, which is why a bad pointer there simply reads or writes whatever physical address it names.
