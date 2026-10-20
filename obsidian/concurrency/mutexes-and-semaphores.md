---
id: locks
title: "Mutexes and semaphores"
section: Concurrency
group: Sharing data safely
source: src/topics/locks.ts
url: ?p=locks
---
# Mutexes and semaphores

## Intro
A mutex lets tasks take turns with shared data: take it, use the data, give it back, and anyone else who wants it waits. A semaphore lets one part of the system signal another. Both make tasks wait, and waiting interacts with priorities in ways that are easy to get wrong. Compare a plain mutex with one that uses priority inheritance, then see a semaphore carry a signal from an interrupt.

## Priority inversion

Low takes a mutex, then High preempts it and asks for the same mutex. High must wait for Low to finish with it, which is fine if that takes a moment. But Medium, which needs no mutex, outranks Low, so whenever it is ready it runs instead of Low, and Low cannot finish and release the mutex. High is now waiting on Medium, a task of lower priority, for as long as Medium cares to run. This is priority inversion, and the delay has no bound.

## Priority inheritance

The fix is to have the mutex lift whoever holds it to the priority of the most important task waiting for it. Low briefly runs at High’s priority, so Medium cannot get in, and High waits only for Low’s critical section, then Low drops back. In 1997 the Mars Pathfinder lander kept resetting itself because a high-priority bus task waited on a mutex held by a low-priority one while medium-priority work ran. Engineers fixed it from Earth by turning on priority inheritance for that mutex. FreeRTOS mutexes inherit priority; binary semaphores do not, which is the main reason to use a mutex, not a semaphore, to protect data.

## Semaphores as signals

A semaphore counts, and taking it when it is zero blocks until someone gives it. Used as a signal, the giver and the taker are different: here a UART interrupt gives the semaphore and a task waiting on it wakes. The handler stays a few instructions long, and the real work happens in a task, at a priority the designer chooses. This is deferred interrupt processing, and it is how most RTOS drivers are built.
