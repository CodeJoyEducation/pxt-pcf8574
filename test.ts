// Basic tests / examples. Use in MakeCode simulator or on hardware.
// Assumes a PCF8574 at 0x20, button on P0 (to GND), LED (active-low) on P1.

let io = pcf8574.create(pcf8574.Address.Addr0x20)

// Blink LED on P1 (active-low)
control.inBackground(function () {
    while (true) {
        io.led(pcf8574.Pin.P1, true)  // ON
        basic.pause(200)
        io.led(pcf8574.Pin.P1, false) // OFF
        basic.pause(200)
    }
})

// Mirror button (P0 -> GND) to LED on P2
control.inBackground(function () {
    while (true) {
        let pressed = io.buttonPressed(pcf8574.Pin.P0, 20)
        io.led(pcf8574.Pin.P2, pressed) // ON when pressed
        basic.pause(10)
    }
})

// Show raw port state on screen every second (for debugging)
basic.forever(function () {
    let raw = io.readPort()
    basic.showNumber(raw)
    basic.pause(1000)
})