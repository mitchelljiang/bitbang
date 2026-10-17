---
id: i2s
title: "I²S"
section: Protocols
group: Audio
source: src/protocols/i2s.ts
url: ?p=i2s
---
# I²S
*Inter-IC Sound*

## Summary
A continuous stream of digital audio samples between chips. The bit clock (SCK) marks each bit, word select (WS) indicates which channel is being sent (low for left, high for right), and the serial data line (SD) carries each sample, most significant bit first. In standard I²S, WS changes one clock cycle before the sample it belongs to.

## Used in
Audio DACs and codecs, digital MEMS microphones, Bluetooth audio chips and smart speakers.

**Tags:** synchronous, single-ended, push-pull, simplex, point-to-point, chip-to-chip, audio, streaming

## At a glance
- **Clock:** Synchronous. The controller drives SCK and WS continuously. Codecs often also require a master clock (MCLK) at 256 times the sample rate.
- **Wires:** SCK, WS and SD, plus ground, and optionally MCLK. Recording and playback use separate SD lines that share the same clocks.
- **Drive:** Push-pull.
- **Duplex:** Each SD line carries data in one direction only. Full duplex uses two SD lines on the same SCK and WS.
- **Topology:** Point-to-point, usually a microcontroller and a codec. TDM variants carry 4 to 16 channels on one data line.
- **Addressing:** None. The level of WS indicates which channel the current sample belongs to.
- **Flow control:** None. Samples stream at a fixed rate and cannot be paused, so the transmitter must always have the next sample ready.
- **Error checking:** None. A corrupted bit is heard as a click in the audio.
- **Speed:** SCK equals the sample rate × the number of channels × the bits per slot. 48 kHz stereo with 32-bit slots requires 3.072 MHz.
- **Reach:** Circuit-board distances. Longer connections require a different link, such as S/PDIF or USB audio.

## Strengths
- Very simple: no addresses, no commands and no overhead; only samples.
- Sample-accurate timing, which is exactly what audio requires.
- Supported by almost every audio codec and by most microcontrollers with audio features.

## Limits
- Suited only to audio-like data: fixed-size samples at a steady rate.
- No error checking or acknowledgment of any kind.
- Several similar formats exist (standard I²S, left-justified and right-justified), and selecting the wrong one produces distorted or very loud audio.
- Limited to two channels per data line unless TDM is used.

## Settings
- **Left sample** — The left-channel sample as a signed whole number. A 16-bit sample ranges from −32768 to 32767.
- **Right sample** — The right-channel sample as a signed whole number.
- **Bits** — The sample size and slot size. 24-bit samples are usually sent in 32-bit slots, with the remaining bits filled with zeros.
- **Format** — Standard I²S starts each sample one clock cycle after WS changes; left-justified starts it on the same clock cycle. Both devices must use the same format.
- **Sample rate** — The audio sample rate. It sets the bit clock frequency: sample rate × 2 channels × slot size.

## Going deeper
### Master clock and sample-rate families
Most audio codecs require a master clock (MCLK) at a fixed multiple of the sample rate, commonly 256 × fs, to run their internal oversampling converters. That is 12.288 MHz for 48 kHz and 11.2896 MHz for 44.1 kHz. Because neither frequency divides evenly into the other, equipment that supports both rate families typically needs two crystals or a fractional PLL.
### Which side drives the clocks
Either side can generate SCK and WS. When the codec is the clock source, the microcontroller follows the codec's clock domain, which is common for recording. When the microcontroller is the source, it must produce exact rates from its own clock tree. Both sides must agree on which one drives the clocks; if both drive them, the outputs contend.
### I²S, left-justified and right-justified
The three common formats differ only in where the sample sits relative to the WS edge. Standard I²S starts the most significant bit one clock after the edge. Left-justified starts it on the edge. Right-justified aligns the least significant bit with the end of the slot, so the receiver must know the word length in advance.
A format mismatch shifts every sample by one or more bits, which typically doubles or halves the amplitude, or corrupts the sign bit and produces loud distortion.
### TDM: more than two channels
Time-division multiplexing (TDM) extends the same idea to many channels. A short frame-sync pulse replaces WS, followed by a fixed number of slots, for example eight 32-bit slots per frame. At 48 kHz that requires a 12.288 MHz bit clock. TDM is used for microphone arrays, multichannel codecs and automotive audio.
### PDM microphones
Many digital MEMS microphones output pulse-density modulation (PDM) instead of I²S: a single-bit stream at several megahertz whose density of 1s follows the audio waveform. Two microphones can share one data line by transmitting on opposite clock edges. The receiver must apply a decimation filter to convert PDM to PCM samples. Microphones with an I²S output, such as the INMP441, contain that filter internally.
