/**
 * PCF8574 – I²C 8-bit I/O expander for micro:bit
 *
 * Simulator-safe:
 *  - In the MakeCode simulator, I²C is replaced by an in-memory mock latch so no errors occur.
 *  - On real hardware, normal I²C reads/writes are used.
 *
 * Features:
 *  - Dropdown of I²C addresses (PCF8574 0x20–0x27, PCF8574A 0x38–0x3F)
 *  - Direct read/write of individual pins (0–7)
 *  - Button helper: assumes button wired from pin → GND with internal pull-up
 *  - LED helper: simple on/off with selectable active-low/active-high wiring
 *  - Defaults to pull-ups when "input" (PCF8574 quasi-bidirectional I/Os)
 *
 * Notes on PCF8574 behavior:
 *  - No direction register. Bit=1 behaves as input (weak pull-up). Bit=0 drives LOW.
 *  - To READ a pin, keep its bit=1. To sink current (e.g., LED active-low), write 0.
 *
 * MIT © 2025
 */

//% color="#00BCD4" weight=65 icon="\uf2db" block="PCF8574"
namespace pcf8574 {

    // --- utils ---

    function isSimulator(): boolean {
        // In MakeCode for micro:bit, simulator reports "sim"
        // If unavailable in some targets, fallback to false.
        let v = ""
        try { v = control.deviceDalVersion() } catch { /* ignore */ }
        return v == "sim"
    }

    /**
     * PCF8574 address options (PCF8574 0x20–0x27, PCF8574A 0x38–0x3F)
     */
    //% blockId=pcf8574_address enum
    export enum Address {
        //% block="0x20" Addr0x20 = 0x20
        Addr0x20 = 0x20,
        //% block="0x21" Addr0x21 = 0x21
        Addr0x21 = 0x21,
        //% block="0x22" Addr0x22 = 0x22
        Addr0x22 = 0x22,
        //% block="0x23" Addr0x23 = 0x23
        Addr0x23 = 0x23,
        //% block="0x24" Addr0x24 = 0x24
        Addr0x24 = 0x24,
        //% block="0x25" Addr0x25 = 0x25
        Addr0x25 = 0x25,
        //% block="0x26" Addr0x26 = 0x26
        Addr0x26 = 0x26,
        //% block="0x27" Addr0x27 = 0x27
        Addr0x27 = 0x27,

        //% block="0x38" Addr0x38 = 0x38
        Addr0x38 = 0x38,
        //% block="0x39" Addr0x39 = 0x39
        Addr0x39 = 0x39,
        //% block="0x3A" Addr0x3A = 0x3A
        Addr0x3A = 0x3A,
        //% block="0x3B" Addr0x3B = 0x3B
        Addr0x3B = 0x3B,
        //% block="0x3C" Addr0x3C = 0x3C
        Addr0x3C = 0x3C,
        //% block="0x3D" Addr0x3D = 0x3D
        Addr0x3D = 0x3D,
        //% block="0x3E" Addr0x3E = 0x3E
        Addr0x3E = 0x3E,
        //% block="0x3F" Addr0x3F = 0x3F
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
     * - Maintains a cached output latch byte to safely change single bits.
     * - Simulator mode: I²C is replaced by an in-memory mock latch (no errors).
     */
    export class Device {
        private addr: number
        private latch: number
        private initialized: boolean
        private sim: boolean
        private simPort: number // simulator "input snapshot" (what readPort() returns)

        /**
         * @param address I²C address from dropdown
         */
        constructor(address: Address) {
            this.addr = address
            this.latch = 0xFF // power-on default: all high (inputs/pull-ups)
            this.initialized = false
            this.sim = isSimulator()
            this.simPort = 0xFF // start released/high for all pins
        }

        /**
         * Initialize the device (writes the current latch to ensure a known state).
         */
        //% blockId=pcf8574_begin block="PCF8574 init at address %address"
        //% group="Setup"
        begin(): void {
            if (this.sim) {
                // In sim, just mirror latch to simPort to resemble "all inputs high"
                this.simPort = this.latch & 0xFF
            } else {
                this.writeByte(this.latch)
            }
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
            if (this.sim) {
                // In sim: reading reflects simPort. For input pins (bit=1 in latch),
                // simPort represents their current (mocked) level.
                // For output-low pins (bit=0 in latch), the chip pulls LOW;
                // emulate that by forcing those bits to 0 in the read result.
                const forcedLowMask = (~this.latch) & 0xFF
                return (this.simPort & this.latch) | (0 & forcedLowMask)
            }
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
            if (this.sim) {
                // In sim, writing affects only the "output drivers":
                // Bits written 0 drive low; bits written 1 release to pull-up (level from simPort).
                // No I²C, so nothing else to do here.
                return
            }
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
            // Ensure input/pull-up
            if ((this.latch & mask) == 0) {
                this.latch |= mask
                if (!this.sim) this.writeByte(this.latch)
                // in sim, simply updating latch is enough
            }
            const v = this.readPort()
            return (v & mask) !== 0
        }

        /**
         * Write one pin (0..7). true -> high (release; pull-up), false -> low (actively sinks).
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
            if (this.sim) {
                // In sim, nothing to write to I²C. The readPort() logic will reflect lows.
                return
            }
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
            if (this.readPin(pin) == false) {
                if (debounceMs > 0) {
                    basic.pause(debounceMs)
                    return this.readPin(pin) == false
                }
                return true
            }
            return false
        }

        /**
         * LED helper. Sets an LED on a pin ON or OFF.
         * Default activeLow=true: LED anode to VCC (via resistor), cathode to pin.
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
            this.writePin(pin, !driveLow)
        }

        /**
         * Convenience: set a pin to "input" (ensures bit=1 so it's pulled-up).
         */
        //% blockId=pcf8574_set_input block="PCF8574 set pin %pin as input (pull-up)"
        //% group="Pins"
        setInput(pin: Pin): void {
            this.writePin(pin, true)
        }

        /**
         * Convenience: set a pin to "output-low" (drives low).
         */
        //% blockId=pcf8574_set_output_low block="PCF8574 set pin %pin as output-low"
        //% group="Pins"
        setOutputLow(pin: Pin): void {
            this.writePin(pin, false)
        }

        // --- Simulator helpers (hidden blocks) ---

        /**
         * Simulator-only: set the simulated input HIGH (released) for a pin.
         * Has no effect on real hardware.
         */
        //% blockId=pcf8574_sim_set_high block="PCF8574 (sim) set pin %pin HIGH"
        //% group="Simulator"
        //% blockHidden=true
        setSimPinHigh(pin: Pin): void {
            if (!this.sim) return
            this.simPort |= (1 << pin)
        }

        /**
         * Simulator-only: set the simulated input LOW (pressed) for a pin.
         * Has no effect on real hardware.
         */
        //% blockId=pcf8574_sim_set_low block="PCF8574 (sim) set pin %pin LOW"
        //% group="Simulator"
        //% blockHidden=true
        setSimPinLow(pin: Pin): void {
            if (!this.sim) return
            this.simPort &= ~(1 << pin)
        }

        // --- internals ---

        private writeByte(b: number): void {
            // Only call in hardware mode
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
