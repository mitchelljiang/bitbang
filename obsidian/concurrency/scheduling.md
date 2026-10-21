---
id: scheduling
title: "Scheduling"
section: Concurrency
group: Running many tasks
source: src/topics/scheduling.ts
url: ?p=scheduling
---
# Scheduling

## Intro
Three tasks share one CPU, each released every few milliseconds with a fixed amount of work that must be done before its next release. The scheduler decides who runs at every tick. Pick a policy, click a task’s work time to change it, and see whether every deadline is still met.

## Fixed priorities and rate-monotonic order

Most RTOS kernels, FreeRTOS and Zephyr among them, use preemptive fixed-priority scheduling: the highest-priority ready task always runs, and a more important task becoming ready takes the CPU immediately. The art is choosing the priorities. Rate-monotonic assignment gives the highest priority to the task with the shortest period, and for independent periodic tasks whose deadline is their next release, it is the best fixed assignment there is: if any fixed priority order meets every deadline, this one does.

## Utilization and the bound

Utilization is the fraction of the CPU the tasks need, the sum of each task’s work divided by its period. It is a property of the task set, shown next to the policies, not a live reading: it changes only when a task’s work does. Above 100% no policy can keep up. Liu and Layland proved that rate-monotonic scheduling always meets every deadline if utilization is at most n(21/n − 1), about 78% for three tasks. That bound is sufficient, not necessary: this task set needs 95% and still fits, which an exact response-time analysis confirms. Raise a task’s work time and watch where it stops fitting.

## Why not round-robin or cooperative

Round-robin is fair, but fairness is not what a real-time system needs: the sensor task gets the same share as the logger even when its deadline is much closer. Cooperative scheduling avoids preemption and the races it causes, but one long task delays everyone: here the logger, once started, holds the CPU while the sensor’s deadline passes. Getting the priorities backwards is just as bad, which is why the order matters more than the speed.
