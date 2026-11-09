---
id: frames
title: "Stack frames"
section: Memory
group: The call stack
source: src/topics/frames.ts
url: ?p=frames
---
# Stack frames

## Intro
Each call in progress owns a slice of the stack, its frame, holding everything that call needs to resume: the address to return to, the registers it borrowed and must give back, and its local variables. The compiler builds the frame in a short prologue at the start of the function and tears it down in an epilogue at the end. Step through both and watch the frame appear slot by slot and then disappear.

## Why save and restore registers

The calling convention splits the registers in two. Some are caller-saved: a function may clobber them freely, so the caller must copy anything it still needs before calling. The rest are callee-saved, r4–r11 on Arm: a function that wants to use them must put the old values back before it returns. That is what the push {r4-r7, …} in the prologue and the matching pop in the epilogue are for. The return address in LR is saved the same way, because any nested call would overwrite LR.

## The frame pointer

Everything in the frame is reached as an offset from SP, so in principle no other register is needed. But SP can move during the body, for example to pass arguments to another call, which would change every offset. To avoid that, the compiler can dedicate a register, the frame pointer (r7 in Thumb, r11 in Arm), to hold a fixed anchor into the frame, so locals keep a constant offset no matter what SP does. Optimised builds often omit it and track the offsets themselves, freeing the register; that is what -fomit-frame-pointer does.

## Reading it in a debugger

A backtrace is just this structure walked in reverse. Each frame’s saved LR says where its caller will resume, and the saved frame pointer (or the known frame size) says where the caller’s frame begins, so the debugger can hop from frame to frame all the way back to main(). Corrupt the saved return address, as a buffer overflow does, and the backtrace, and the return, go wrong.
