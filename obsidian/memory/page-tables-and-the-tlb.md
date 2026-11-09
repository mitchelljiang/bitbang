---
id: paging
title: "Page tables and the TLB"
section: Memory
group: Virtual memory
source: src/topics/paging.ts
url: ?p=paging
---
# Page tables and the TLB

## Intro
The map from virtual pages to physical frames is itself a structure in memory: the page table. Storing one entry per page would be enormous, so it is a tree, walked a few bits of the address at a time. That walk costs extra memory accesses on every translation, so the MMU keeps a small cache of recent translations, the TLB, and checks it first. Access an address below to watch the walk, then access the same page again to watch the TLB answer it.

## Why a tree, and why it is walked

A flat table with one entry per virtual page would need megabytes per process, almost all of it describing pages that are never used. A multi-level table only spends memory on the branches that exist: the top level points at second-level tables, which point at frames, and an absent branch costs one empty entry instead of a whole table. The price is that a translation now reads one table per level before it reaches the frame, so on a 64-bit machine with four levels, one load can mean four hidden loads first. That is the page-table walk, and it is done in hardware by the MMU.

## The TLB

Paying for a walk on every access would be ruinous, but programs touch the same handful of pages over and over, so the translations repeat. The translation lookaside buffer is a small, fully associative cache of recent virtual-page → frame mappings, checked before any walk. A TLB hit translates in effectively no time; only a miss walks the table and then fills the TLB. Hit rates are normally well over 99%, which is the only reason paged memory is fast enough to use at all.

## Context switches and flushes

Because each process has its own page table, the same virtual page means different frames in different processes, so a naive TLB has to be flushed on every context switch, and every entry is a cold miss afterward. Real processors avoid most of that by tagging TLB entries with an address-space identifier, so entries from several processes coexist and survive the switch. Changing a page table also means invalidating the stale TLB entries by hand, a step that, forgotten, produces translations that quietly point at the wrong memory.
