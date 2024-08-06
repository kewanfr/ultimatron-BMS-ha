"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UltimatronBattery = void 0;
const noble = require('@abandonware/noble');
// currently voltage is not used
const cmdVoltage = Buffer.from("dda50400fffc77", 'hex');
const cmdDetails = Buffer.from("dda50300fffd77", 'hex');
// const cmdBattery = Buffer.from("dda5aa00ff5677", 'hex')
// battery output:
//Notification handle = 0x0011 value: dd aa 00 18 00 01 00 00 00 00 2f 53 00 00 00 00 00 03 00 00
//Notification handle = 0x0011 value: 00 00 00 01 00 00 00 2a ff 37 77
const batteryServiceId = 'ff00';
const notifyCharId = 'ff01';
const writeCharId = 'ff02';
const cmdEnableChargeOnly = Buffer.from('dd5ae1020002ff1b77', 'hex');
const cmdEnableDischargeOnly = Buffer.from('dd5ae1020001ff1c77', 'hex');
const cmdEnableChargeAndDischarge = Buffer.from('dd5ae1020000ff1d77', 'hex');
const cmdDisableChargeAndDischarge = Buffer.from('dd5ae1020003ff1a77', 'hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class UltimatronBattery {
    constructor(name, shared = false, updateInterval, commonName = "") {
        this.updateInterval = 30000;
        this.device = null;
        this.writeChar = null;
        this.state = null;
        this.voltages = null;
        this.pollerId = null;
        this.stateListeners = [];
        this.connected = false;
        this.connectionOpsQueue = [];
        this.connectionBusy = false;
        // if true updates only change internal state without notifying listeners
        this.silenced = false;
        // TODO: make private
        this.name = name;
        this.sharedMode = shared;
        this.updateInterval = updateInterval;
        this.commonName = commonName;
    }
    /**
     * Scans for a single battery with a specified advertised name.
     *
     * @param {number} scanTimeoutMs - timeout after which scanning stops.
     * @param {boolean} shared - creates battery instance in shared mode. Which means that BLE connection is only kept
     *                            for short update periods and can be used by other BLE clients.
     * @param {updateIntervalMs} - period between battery state updates
     */
    static async forName(name, shared = false, scanTimeoutMs, updateIntervalMs = 30000) {
        const battery = new UltimatronBattery(name, shared, updateIntervalMs);
        var connected = false;
        return await new Promise((resolve, reject) => {
            // Fail after 'scanTimeout' milliseconds
            setTimeout(() => {
                if (!connected) {
                    noble.stopScanningAsync().then(() => {
                        if (!connected)
                            reject(Error("Timeout while looking for a device"));
                    });
                }
            }, scanTimeoutMs);
            noble.on("stateChange", async (state) => {
                if (state === "poweredOn") {
                    console.log("Started device scanning");
                    await noble.startScanningAsync([batteryServiceId], false);
                }
                else {
                    await noble.stopScanningAsync();
                }
            });
            noble.on("discover", async (peripheral) => {
                if (peripheral.advertisement.localName !== name)
                    return;
                await noble.stopScanningAsync();
                await battery.initialSetup(peripheral);
                connected = true;
                resolve(battery);
            });
        });
    }
    /**
     * Scans for multiple accessible batteries for up to scanTimeoutMs.
     * @param {number} scanTimeoutMs - timeout after which scanning stops and all found devices returned.
     * @param {number} limit - allows to stop scan earlier as long as 'limit' number of devices found.
     * @param {boolean} shared - creates battery instances in shared mode. Which means that BLE connection is only kept
     *                            for short update periods and can be used by other BLE clients.
     * @param {updateIntervalMs} - period between battery state updates
     */
    static async findAll(scanTimeoutMs, limit = -1, shared = false, updateIntervalMs = 30000) {
        const batteries = [];
        return await new Promise((resolve, reject) => {
            // Return whatever we found in specified time
            const timeout = setTimeout(() => noble.stopScanningAsync().then(() => resolve(batteries)), scanTimeoutMs);
            noble.on("stateChange", async (state) => {
                if (state === "poweredOn") {
                    console.log("Started device scanning");
                    await noble.startScanningAsync([batteryServiceId], false);
                }
                else {
                    await noble.stopScanningAsync();
                }
            });
            noble.on("discover", async (peripheral) => {
                if (batteries.find((b) => b.name === peripheral.advertisement.localName)) {
                    console.log("Ignoring already found battery:", peripheral.advertisement.localName);
                }
                else {
                    console.log("Found a battery: " + peripheral.advertisement.localName);
                    const battery = new UltimatronBattery(peripheral.advertisement.localName, shared, updateIntervalMs);
                    batteries.push(battery);
                    try {
                        await noble.stopScanningAsync();
                        await battery.initialSetup(peripheral);
                        await noble.startScanningAsync([batteryServiceId], false);
                    }
                    catch (e) {
                        reject(e);
                        return;
                    }
                    // Early return
                    if (limit != -1 && batteries.length == limit) {
                        clearTimeout(timeout);
                        await noble.stopScanningAsync();
                        resolve(batteries);
                    }
                }
            });
        });
    }
    async initialSetup(peripheral) {
        try {
            this.device = peripheral;
            this.device.once("disconnect", () => {
                this.connected = false;
            });
            await this.connect();
            await this.writeCommand(cmdDetails);
            // this.initPoller()
        }
        catch (e) {
            console.log("Initialization error", e);
            throw e;
        }
    }
    async connect() {
        if (!this.connected) {
            // console.log("connecting to device");
            await this.device.connectAsync();
            this.connected = true;
            const { characteristics } = await this.device.discoverSomeServicesAndCharacteristicsAsync([
                batteryServiceId,
            ]);
            const notifyChar = characteristics.find((c) => c.uuid == notifyCharId);
            this.writeChar = characteristics.find((c) => c.uuid == writeCharId);
            var bufferPart = null;
            notifyChar.on("data", (buffer) => {
                try {
                    if (this.header(buffer) === "dd03") {
                        console.log("[Data] leaving for later: " + buffer.toString("hex"));
                        bufferPart = buffer;
                    }
                    else {
                        console.log("[Data] last chunk: " + buffer.toString("hex"));
                        this.messagesRouter(bufferPart ? Buffer.concat([bufferPart, buffer]) : buffer);
                        bufferPart = null;
                    }
                }
                catch (e) {
                    console.log("Error", e);
                    bufferPart = null;
                }
            });
            await notifyChar.subscribeAsync();
            await this.writeCommand(cmdDetails);
            console.log("Connected to device");
        }
        else {
            console.log("already connected");
        }
    }
    async disconnect() {
        const device = this.device;
        if (device) {
            await device.disconnectAsync();
            device.removeAllListeners();
            this.writeChar = null;
            this.connected = false;
        }
    }
    setUpdateInterval(intervalMs) {
        // TODO: reschedule the listener if necessary, allow auto mode?
        this.updateInterval = intervalMs;
    }
    async shutdown() {
        await this.disconnect();
        if (this.pollerId)
            clearTimeout(this.pollerId);
    }
    /** Subscribes on periodic state updates */
    onStateUpdate(fn) {
        this.stateListeners.push(fn);
    }
    /** Returns latest obtained battery state or null if state has not been initialized yet */
    getLastState() {
        return this.state;
    }
    async initPoller() {
        let random = Math.random() * 1000;
        console.log("Starting poller with interval: " + this.updateInterval, this.name, random);
        this.pollerId = setTimeout(() => this.polling(), 1000 + random); // small initial timeout + random
        this.pollerId = setInterval(() => this.polling(), this.updateInterval + random);
    }
    async polling() {
        try {
            await this.withConnection(async () => this.obtainState());
        }
        catch (e) {
            console.log("Polling operation failed:", e);
        }
    }
    async obtainState(tries = 5) {
        await this.writeCommand(cmdDetails);
        try {
            return await this.awaitForState();
        }
        catch (e) {
            // device not always responds on the first details command
            if (tries > 0) {
                return await this.obtainState(tries - 1);
            }
            else {
                throw e;
            }
        }
    }
    async withConnection(fn) {
        if (this.connectionBusy) {
            console.log("Connection is used right now. Enquing operation");
            this.connectionOpsQueue.push(fn);
        }
        try {
            this.connectionBusy = true;
            await this.connect();
            try {
                await fn();
            }
            catch (e) {
                console.error("Failed to execute operation withing connection", e);
                throw e;
            }
            finally {
                if (this.sharedMode) {
                    console.log("[shared mode] disconnecting");
                    await this.disconnect();
                }
            }
        }
        finally {
            this.connectionBusy = false;
            const enquedOperation = this.connectionOpsQueue.shift();
            if (enquedOperation) {
                console.log("Getting operation from queue");
                this.withConnection(enquedOperation);
            }
        }
    }
    // not used currently
    // getVoltages(): BatteryVoltage | null {
    //   return this.voltages
    // }
    async toggleChargingAndDischarging(charging = true, discharging = true) {
        console.log("Toggling charge and discharge: ", charging, discharging);
        await this.withConnection(async () => {
            await this.writeCommand(this.commandForStates(charging, discharging));
            await this.writeCommand(cmdDetails);
            await this.awaitForState();
        });
        return this;
    }
    async toggleDischarging(enable = true) {
        console.log("Toggling discharge: ", enable);
        // if (this.state) {
        //   this.state.status.discharing = enable
        //   this.resendStateUpdate(this.state!)
        // }
        await this.withConnection(async () => {
            this.silenced = true;
            try {
                const state = await this.obtainState();
                await this.writeCommand(this.commandForStates(state.status.charging, enable));
            }
            finally {
                this.silenced = false;
            }
            await sleep(1000);
        });
        setTimeout(() => {
            this.withConnection(async () => {
                await this.obtainState();
            });
        }, 1000);
        return this;
    }
    async toggleCharging(enable = true) {
        console.log("Toggling charge: ", enable);
        await this.withConnection(async () => {
            this.silenced = true;
            try {
                const state = await this.obtainState();
                state.status.charging = enable;
                await this.writeCommand(this.commandForStates(enable, state.status.discharing));
            }
            finally {
                this.silenced = false;
            }
            await sleep(1000);
        });
        setTimeout(() => {
            this.withConnection(async () => {
                await this.obtainState();
            });
        }, 1000);
        return this;
    }
    // Returns a proper command to toggle battery charge or discharge
    commandForStates(charge, discharge) {
        if (charge) {
            return discharge ? cmdEnableChargeAndDischarge : cmdEnableChargeOnly;
        }
        else {
            return discharge ? cmdEnableDischargeOnly : cmdDisableChargeAndDischarge;
        }
    }
    async awaitForState() {
        const curState = this.state;
        console.log("[state await] current: ", curState ? curState.stamp : null);
        return await new Promise((resolve, reject) => {
            const stateAwait = (waitIterations) => {
                setTimeout(() => {
                    if (this.state !== curState) {
                        resolve(this.state);
                    }
                    else if (waitIterations > 0) {
                        stateAwait(waitIterations - 1);
                    }
                    else {
                        reject(new Error("Timed out while waiting for the initial battery state"));
                    }
                }, 20);
            };
            stateAwait(500);
        });
    }
    async writeCommand(cmd) {
        if (this.writeChar == null)
            throw "Device is not initialized";
        console.log("writing cmd: " + cmd.toString("hex"));
        return await this.writeChar.write(cmd, true);
    }
    messagesRouter(buf) {
        console.log("Processing data: " + buf.toString("hex"));
        switch (this.header(buf)) {
            case "dd03":
                this.state = this.processBatteryData(buf);
                this.resendStateUpdate(this.state);
                break;
            case "dd04":
                this.voltages = this.processVoltageData(buf);
                break;
            default:
                console.log("Ignoring incoming buffer: " + buf.toString("hex"));
        }
    }
    resendStateUpdate(state) {
        if (!this.silenced) {
            this.stateListeners.forEach((listener) => listener(state));
        }
        else {
            console.log("Skipping listeners notification");
        }
    }
    // dd03001b053000dd0400080cf500dd03001b0530000023ce2710000c2a8c000000001000225c0104
    processBatteryData(buf) {
        const voltage = buf.readUint16BE(4) / 100;
        const current = buf.readUint16BE(6) / 100;
        return {
            voltage: voltage,
            current: current > 327.68 ? current - 655.36 : current,
            residualCapacity: buf.readUint16BE(8) / 100,
            standardCapacity: buf.readUint16BE(10) / 100,
            cycles: buf.readUint16BE(12),
            prodDate: this.parseDate(buf.readUint16BE(14)),
            stateProtection: buf.readUint16BE(20),
            swVersion: buf.readUint16BE(22),
            residualCapacityPercent: buf.readUint8(23),
            status: {
                charging: (buf.readUint8(24) & 1) != 0,
                discharing: (buf.readUint8(24) & 2) != 0,
            },
            batteryNo: buf.readUint8(25),
            temperatures: this.getTemperatures(buf),
            powerDrain: voltage * current,
            stamp: new Date(),
        };
    }
    // example data: dd0400080d000d020d030d04ffbb77
    processVoltageData(buf) {
        const voltageBuf = buf.subarray(4, buf.length - 3);
        const count = voltageBuf.length / 2;
        var voltages = [];
        for (var i = 0; i < count; i++) {
            voltages.push(voltageBuf.readInt16BE(i * 2) / 1000);
        }
        return {
            voltages: voltages,
            stamp: new Date(),
        };
    }
    parseDate(num) {
        return Date.parse((num >> 9) +
            2000 +
            "-" +
            ((num >> 5) & 15).toString().padStart(2, "0") +
            "-" +
            (31 & num).toString().padStart(2, "0"));
    }
    getTemperatures(buf) {
        const offset = 4 + 22;
        const size = buf[offset];
        const array = [];
        for (let i = 0; i < size; i++) {
            const nextOffset = offset + 1 + i * 2;
            if (buf.length - 3 > nextOffset + 1) {
                const temp = (buf.readInt16BE(nextOffset) - 2731) / 10;
                array.push(temp);
            }
        }
        return array;
    }
    header(buf) {
        return buf.subarray(0, 2).toString("hex");
    }
}
exports.UltimatronBattery = UltimatronBattery;
//# sourceMappingURL=battery.js.map