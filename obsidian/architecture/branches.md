---
id: branches
title: "Branches"
section: Architecture
group: Execution
source: src/topics/branches.ts
url: ?p=branches
---
# Branches

## Intro
A branch is only decided in Execute, but the pipeline has already fetched what comes after it. If it guessed wrong, that work is thrown away and refilled. So the processor guesses, and the guess is worth getting right. Pick how it guesses, then step through one branch running over and over.

## What a wrong guess costs

A wrong guess costs one refill: the cycles needed to get the correct instruction through the pipeline’s early stages. That is 1 cycle on a two-stage Cortex-M0+, around 2 on a three-stage Cortex-M4, and more on anything deeper. Slow Flash adds to it. See the pipeline for the cycles themselves.

## Why two bits

A loop’s branch is taken again and again and then falls through once. A 1-bit predictor gets that exit wrong, then also gets the first branch of the next run wrong, because it remembers the exit. Two bits ride over one surprise: the counter slips from strong to weak and still guesses taken. So a 2-bit predictor misses once per loop and a 1-bit predictor twice.

## On a microcontroller

The Cortex-M0+ and Cortex-M4 have no history table; with so few stages, it would save little. The Cortex-M7, with six stages, does predict dynamically. Fast predictors in larger processors are the same idea with more history.

You can also avoid the question. A branch that is hard to predict can sometimes be replaced by arithmetic, which is why -Os turned the comparison on the undefined behavior page into subs, rsbs and adcs instead of a jump. And when code must take exactly the same time whatever the data, as cryptography must, avoiding branches matters regardless of how good the prediction is.
