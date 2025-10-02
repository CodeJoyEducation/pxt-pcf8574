/**
 * PCF8574 – I²C 8-bit I/O expander for micro:bit
 * 
 * Features:
 *  - Dropdown of I²C addresses (PCF8574 0x20–0x27, PCF8574A 0x38–0x3F)
 *  - Direct read/write of individual pins (0–7)
 *  - Button helper: assumes button wired from pin → GND with internal pull-up
 *  - LED helper: simple on/off with selectable active-low/active-high wiring
 *  - Defaults to pull-ups when "input" (PCF8574 uses quasi-bidirectional I/Os:
 *      set bit = 1 to let pin float high via internal current source
 *      clear bit = 0 to drive low)
 *  - Ample inline docs and MakeCode blocks
 * 
 * Notes on PCF8574 behavior:
 *  - There is no direction register. A bit=1 behaves as input with weak pull-up.
 *    A bit=0 drives the pin low (output-low).
 *  - To READ a pin, make sure its bit is 1 in the output latch, then read.
 *  - To WRITE a pin high, write 1 (lets it float high via pull-up).
 *    To WRITE low, write 0 (actively sinks to GND).
 *
 * MIT © 2025
 */

//% color="#00BCD4" weight=65 icon="\uf2db" block="PCF8574"
namespace pcf8574 {

    /**
     * PCF8574 address options.
     * Includes PCF8574 (0x20–0x27) and PCF8574A (0x38–0x3F).
     */
    //% blockId=pcf8574_address enum
    export enum Address {
        // PCF8574: A2..A0 -> 000..111
        //% block="0x20"
        Addr0x20 = 0x20,
        //% block="0x21"
        Addr0x21 = 0x21,
        //% block="0x22"
        Addr0x22 = 0x22,
        //% block="0x23"
        Addr0x23 = 0x23,
        //% block="0x24"
        Addr0x24 = 0x24,
        //% block="0x25"
        Addr0x25 = 0x25,
        //% block="0x26"
        Addr0x26 = 0x26,
        //% block="0x27"
        Addr0x27 = 0x27,

        // PCF8574A: A2..A0 -> 000..111 (different base)
        //% block="0x38"
        Addr0x38 = 0x38,
        //% block="0x39"
        Addr0x39 = 0x39,
        //% block="0x3A"
        Addr0x3A = 0x3A,
        //% block="0x3B"
        Addr0x3B = 0x3B,
        //% block="0x3C"
        Addr0x3C = 0x3C,
        //% block="0x3D"
        Addr0x3D = 0x3D,
        //% block="0x3E"
        Addr0x3E = 0x3E,
        //% block="0x3F"
        Addr0x3F = 0x3F
    }

    /**
     * Pin numbers on the PCF8574 (0..7)
     */
    //% blockId=pcf8574_pin enum
    export enum Pin {
        //% block="P0"
        P0 = 0,
        //% block="P1"
        P1 = 1,
        //% block="P2"
        P2 = 2,
        //% block="P3"
        P3 = 3,
        //% block="P4"
        P4 = 4,
        //% block="P5"
        P5 = 5,
        //% block="P6"
        P6 = 6,
        //% block="P7"
        P7 = 7
    }

    /**
     * An instance representing one PCF8574 device on the bus.
     * Maintains a cached output latch byte so we can change single bits safely.
     */
    export class Device {
        private addr: number
        private latch: number
        private initialized: boolean

        /**
         * @param address I²C address from dropdown
         */
        constructor(address: Address) {
            this.addr = address
            // Power-on default of PCF8574 latch is 0xFF (all high / all "inputs").
            this.latch = 0xFF
            this.initialized = false
        }

        /**
         * Initialize the device (writes the current latch to ensure a known state).
         */
        //% blockId=pcf8574_begin block="PCF8574 init at address %address"
        //% group="Setup"
        begin(): void {
            this.writeByte(this.latch)
            this.initialized = true
        }

        /**
         * Read the raw 8-bit port value.
         * Ensure bits are 1 for pins you intend to read (input with pull-up).
         */
        //% blockId=pcf8574_read_port block="PCF8574 read port"
        //% group="Low-level"
        readPort(): number {
            this.ensureInit()
            return pins.i2cReadNumber(this.addr, NumberFormat.UInt8BE, false) & 0xFF
        }

        /**
         * Write the raw 8-bit port value. WARNING: This drives low on 0-bits.
         * Typically you want to keep bits=1 for input pins.
         * @param value 0..255
         */
        //% blockId=pcf8574_write_port block="PCF8574 write port %value"
        //% value.min=0 value.max=255
        //% group="Low-level"
        writePort(value: number): void {
            this.ensureInit()
            this.latch = value & 0xFF
            this.writeByte(this.latch)
        }

        /**
         * Read one pin (0..7). Automatically ensures that pin bit is 1 (input/pull-up) before reading.
         * For a button-to-GND: returns false (0) when pressed, true (1) when released.
         * @param pin 0..7
         */
        //% blockId=pcf8574_read_pin block="PCF8574 read pin %pin"
        //% group="Pins"
        readPin(pin: Pin): boolean {
            this.ensureInit()
            const mask = 1 << pin
            // Set bit high so pin behaves as input with pull-up
            this.latch |= mask
            this.writeByte(this.latch)

            const v = this.readPort()
            return (v & mask) !== 0
        }

        /**
         * Write one pin (0..7). true -> high (input-ish w/ pull-up), false -> low (actively sinks).
         * @param pin 0..7
         * @param high true = 1, false = 0
         */
        //% blockId=pcf8574_write_pin block="PCF8574 write pin %pin to %high"
        //% group="Pins"
        writePin(pin: Pin, high: boolean): void {
            this.ensureInit()
            const mask = 1 << pin
            if (high) this.latch |= mask
            else this.latch &= ~mask
            this.writeByte(this.latch)
        }

        /**
         * Button helper. Assumes a momentary button wired from pin → GND.
         * Returns true only when the button is currently pressed (active-low),
         * with optional debounce (ms). Debounce checks for a stable low.
         * @param pin 0..7
         * @param debounceMs debounce in ms (default 20)
         */
        //% blockId=pcf8574_button_pressed block="PCF8574 button pressed on %pin (debounce %debounceMs ms)"
        //% debounceMs.defl=20
        //% group="Helpers"
        buttonPressed(pin: Pin, debounceMs: number = 20): boolean {
            // Ensure input/pull-up
            if (this.readPin(pin) == false) {
                if (debounceMs > 0) {
                    basic.pause(debounceMs)
                    // re-check
                    return this.readPin(pin) == false
                }
                return true
            }
            return false
        }

        /**
         * LED helper. Sets an LED on a pin ON or OFF.
         * By default, assumes LED anode to VCC with resistor and cathode to pin (active-low).
         * Set activeLow=false if your LED is wired anode to pin / cathode to GND (active-high).
         * @param pin 0..7
         * @param on true=LED on, false=LED off
         * @param activeLow true if LED turns ON when pin is LOW (default true)
         */
        //% blockId=pcf8574_led block="PCF8574 LED on %pin set %on || active-low %activeLow"
        //% on.shadow=toggleOnOff
        //% activeLow.defl=true
        //% group="Helpers"
        led(pin: Pin, on: boolean, activeLow: boolean = true): void {
            const driveLow = activeLow ? on : !on
            this.writePin(pin, !driveLow) // driveLow=false -> write high; driveLow=true -> write low
        }

        /**
         * Convenience: set a pin to "input" (ensures bit=1 so it's pulled-up).
         * On PCF8574, this is just writing a 1 to that bit.
         */
        //% blockId=pcf8574_set_input block="PCF8574 set pin %pin as input (pull-up)"
        //% group="Pins"
        setInput(pin: Pin): void {
            this.writePin(pin, true) // 1 -> input/pull-up
        }

        /**
         * Convenience: set a pin to "output-low" (drives low). Writing HIGH merely releases to pull-up.
         */
        //% blockId=pcf8574_set_output_low block="PCF8574 set pin %pin as output-low"
        //% group="Pins"
        setOutputLow(pin: Pin): void {
            this.writePin(pin, false)
        }

        private writeByte(b: number): void {
            pins.i2cWriteNumber(this.addr, b & 0xFF, NumberFormat.UInt8BE, false)
        }

        private ensureInit(): void {
            if (!this.initialized) this.begin()
        }
    }

    /**
     * Create a PCF8574 device instance.
     * You can have multiple expanders at different addresses.
     */
    //% blockId=pcf8574_create block="PCF8574 create at address %address"
    //% blockSetVariable=myPCF
    export function create(address: Address): Device {
        return new Device(address)
    }
}
