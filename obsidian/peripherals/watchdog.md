---
id: watchdog
title: "Watchdog"
section: Peripherals
group: Time
source: src/topics/watchdog.ts
url: ?p=watchdog
---
# Watchdog

## Intro
A watchdog is a timer that resets the chip unless the program keeps telling it everything is fine. It counts down on its own clock; the main loop writes a key to reload it, a kick, each time round. If the loop hangs, or runs too slowly, the counter reaches zero and the chip restarts, which is usually better than sitting stuck. Here the watchdog times out after 50 ms. Pick how often the loop kicks it, or make it hang.

## Counting down on its own clock

The independent watchdog runs from the LSI, a separate 32 kHz oscillator inside the chip, so it keeps counting even if the main clock fails or the code has turned it off by mistake. It divides the LSI by a prescaler, then counts down from the reload register, RLR, to zero. Writing 0xAAAA to its key register reloads the counter; that is the kick. Once started, with 0xCCCC, it cannot be stopped until the next reset. The timeout is

$$
t_{\mathrm{out}} = \frac{4 \cdot 2^{\mathrm{PR}} \cdot (\mathrm{RLR} + 1)}{f_{\mathrm{LSI}}} = \frac{4 \cdot 1 \cdot 400}{32\,\mathrm{kHz}} = 50\,\mathrm{ms}
$$

The longest, with the /256 prescaler and RLR = 4095, is about 32.8 s. The LSI is not precise, anywhere from 17 to 47 kHz on an STM32F4, so choose a timeout with plenty of margin over the slowest normal loop.

## Where to kick

Kick from one place in the main loop, after the work that proves the program is healthy, never from a timer interrupt: an interrupt keeps firing even while the main loop is stuck, and the watchdog would never notice. On an RTOS, each task reports in and a supervisor kicks only when all of them have. After a watchdog reset, firmware can read the reset-cause flags (IWDGRSTF in RCC_CSR) to log what happened instead of restarting silently.

## The window watchdog

The STM32 also has a window watchdog, WWDG, which resets the chip if it is kicked too late or too early. A kick that comes too soon means the loop is skipping work, a fault the independent watchdog cannot see. The cost is a tighter timing budget, and it runs from the main clock.
