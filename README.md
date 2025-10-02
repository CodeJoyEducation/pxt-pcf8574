# PCF8574 – MakeCode extension for micro:bit (v0.2.0)

Control a **PCF8574 / PCF8574A** 8-bit I²C I/O expander from MakeCode:
- Address dropdowns (`0x20–0x27` for PCF8574, `0x38–0x3F` for PCF8574A)
- Read/write individual pins
- Button helper (assumes **button → GND**, with debounce)
- LED helper (active-low by default, optional active-high)
- Defaults to pull-ups for inputs (quasi-bidirectional PCF8574 behavior)

## Wiring quick guide

- **I²C:** `VCC` (3.3V), `GND`, `SCL`, `SDA` to micro:bit (via edge connector / breakout)
- **Address pins A0..A2:** set per your board; choose corresponding dropdown address
- **Buttons:** Pin → **button → GND** (internal pull-up is assumed)
- **LEDs:**
  - **Active-low (recommended):** LED+ → VCC (via resistor), LED− → expander pin
  - **Active-high:** LED+ → expander pin (via resistor), LED− → GND

## Blocks / API

```ts
let exp = pcf8574.create(pcf8574.Address.Addr0x20)
exp.begin()                     // optional; auto-called on first use

// Pin I/O
exp.setInput(pcf8574.Pin.P0)    // make pin input with pull-up (bit=1)
let level = exp.readPin(pcf8574.Pin.P0) // true=HIGH, false=LOW

exp.setOutputLow(pcf8574.Pin.P1) // force low (sink)
exp.writePin(pcf8574.Pin.P1, true)  // release to HIGH (pull-up)

// Button helper (button -> GND)
if (exp.buttonPressed(pcf8574.Pin.P2, 20)) {
    basic.showIcon(IconNames.Heart)
}

// LED helper
// Active-low (default): ON drives pin LOW (sinks)
exp.led(pcf8574.Pin.P3, true)   // turn LED on
exp.led(pcf8574.Pin.P3, false)  // turn LED off

// Active-high wiring:
exp.led(pcf8574.Pin.P4, true, false)  // true->HIGH turns ON
