import { createWebHashHistory } from "vue-router";


export interface EEPromConfig {
    ClockSpeedHz: number;
    EEpromBusAddress: number;
    EEpromAddressSize: number;
    EEpromWriteBufferSize: number;
    EEpromWriteDelay: number;
}


class TransferBuffer {

    private buffer = new Uint8Array(0x400)
    private index = 0;
    private sofChar = 0x77;
    private dleChar = 0x88;
    private eofChar = 0x99;

    private IsReceiveMode = false;


    public get bytesInBuffer() {
        return this.index;
    }

    addInt8(value: number) {
        value &= 0xff;

        if (!this.IsReceiveMode) {
            if (value == this.sofChar || value == this.dleChar || value == this.eofChar) {
                this.buffer[this.index++] = this.dleChar;
            }
        }

        this.buffer[this.index++] = value;
    }

    addInt16(value: number) {
        this.addInt8((value >> 0));
        this.addInt8((value >> 8));
    }

    addInt32(value: number) {
        this.addInt8((value >> 0));
        this.addInt8((value >> 8));
        this.addInt8((value >> 16));
        this.addInt8((value >> 24));
    }

    addInt8Array(data: Uint8Array) {
        data.forEach(x => this.addInt8(x));
    }

    startPacket() {
        this.IsReceiveMode = false;
        this.index = 0;
        this.buffer[this.index++] = (this.sofChar >> 0) & 0xff;
    }

    finishPacket() {
        this.buffer[this.index++] = (this.eofChar >> 0) & 0xff;
        return this.buffer.slice(0, this.index);
    }

    startReceive() {
        this.index = 0;
        this.IsReceiveMode = true;
    }

    getData(offset: number, nbytes: number) {
        return this.buffer.slice(offset, offset + nbytes)
    }
    ResetIndex() {
        this.index = 0;
    }

}

export class SeeProg {
    private writer: WritableStreamDefaultWriter<Uint8Array> | undefined;

    private transferBuffer: TransferBuffer = new TransferBuffer(); 

    constructor(private port: SerialPort) {
        this.writer = this.port.writable?.getWriter();
    }

    close() {
        this.writer?.releaseLock();
        this.port.close();
    }

    async ReadEEprom(address: number, byteCount: number): Promise<Uint8Array> {

        let chunkSize = 512;
        let dataIndex = 0;
        const data = new Uint8Array(byteCount);


        while (byteCount - dataIndex > 0) {

            if (byteCount - dataIndex < chunkSize)
                chunkSize = byteCount - dataIndex;

            await this.readEEprom(address + dataIndex, chunkSize).then(x => x.forEach(b => data[dataIndex++] = b));
        }

        return data;
    }

    private async readEEprom(address: number, byteCount: number): Promise<Uint8Array> {
        console.log(`ReadEEprom : ${address.toString(16)} ${byteCount}`);

        this.transferBuffer.startPacket();
        this.transferBuffer.addInt8('R'.charCodeAt(0));
        this.transferBuffer.addInt32(address);
        this.transferBuffer.addInt32(byteCount);
        const packet = this.transferBuffer.finishPacket()
        console.log("SEND: ", packet);

        await this.writer?.write(packet)

        this.transferBuffer.startReceive();

        let result = -1;
        const data = new Uint8Array(byteCount);
        let dataIndex = 0;

        do {
            await this.ReadDataFromSerial();
            const newBytes = this.transferBuffer.bytesInBuffer;
            if (newBytes != 0) {
                if (result == -1) {
                    result = this.transferBuffer.getData(0, 1)[0];
                    if (result != 0) {

                        console.log(`ERROR ${result}`, this.transferBuffer.getData(0, this.transferBuffer.bytesInBuffer));
                        throw `ReadEEprom Error: ${result} Address: ${address.toString(16)}`
                    }

                    this.transferBuffer.getData(1, newBytes - 1).forEach(v => data[dataIndex++] = v);
                } else {
                    this.transferBuffer.getData(0, newBytes).forEach(v => data[dataIndex++] = v);
                }

                this.transferBuffer.ResetIndex();
            }

        } while (dataIndex < byteCount)
        console.log("INC: ", data);
        return data;
    }


    async WriterEEprom(address: number, data: Uint8Array , timeout:number) {

        let chunkSize = 512;
        let dataIndex = 0;
        const byteCount = data.length;

        while (byteCount - dataIndex > 0) {

            if (byteCount - dataIndex < chunkSize)
                chunkSize = byteCount - dataIndex;

            await this.writerEEprom(address + dataIndex, data.slice(dataIndex, dataIndex + chunkSize), timeout);

            dataIndex += chunkSize;
        }
    }

    private async writerEEprom(address: number, data: Uint8Array , timeout:number) {
        this.transferBuffer.startPacket();
        this.transferBuffer.addInt8('W'.charCodeAt(0));
        this.transferBuffer.addInt32(address);
        this.transferBuffer.addInt32(data.length);
        this.transferBuffer.addInt8Array(data);
        const packet = this.transferBuffer.finishPacket()
        console.log("SEND: ", packet);

        await this.writer?.write(packet)

        this.transferBuffer.startReceive();

        let result = -1;
      
        do {
            await this.ReadDataFromSerial(timeout);
            const newBytes = this.transferBuffer.bytesInBuffer;
            if (newBytes != 0) {
                result = this.transferBuffer.getData(0, 1)[0];

                if (result != 0)
                    throw `writerEEprom ERROR: ${result}`
            }
        } while (result == -1)
    }

    async SetConfig(config: EEPromConfig): Promise<void> {
        console.log("SetConfig :", config);


        this.transferBuffer.startPacket();
        this.transferBuffer.addInt8('S'.charCodeAt(0));
        this.transferBuffer.addInt32(config.ClockSpeedHz);
        this.transferBuffer.addInt8(config.EEpromBusAddress);
        this.transferBuffer.addInt16(config.EEpromAddressSize);
        this.transferBuffer.addInt16(config.EEpromWriteBufferSize);
        this.transferBuffer.addInt32(config.EEpromWriteDelay);
        const packet = this.transferBuffer.finishPacket()

        console.log("SEND: ", packet);

        await this.writer?.write(packet)

        this.transferBuffer.startReceive();


        await this.ReadDataFromSerial();

        if (this.transferBuffer.bytesInBuffer != 0) {
            const result = this.transferBuffer.getData(0, 1)[0];
            if (result == 0) {           
                return;
            }            

            console.log(`ERROR ${result}`, this.transferBuffer.getData(0, this.transferBuffer.bytesInBuffer));
            throw `SetConfig Error: ${result}`
        }

    }

    private async ReadDataFromSerial(timeout = 1000) {
        const reader = this.port.readable?.getReader();
        const timer = setTimeout(() => {
            reader?.releaseLock();
            throw "Timeout";
        }, timeout);

        await reader?.read()
            .then(r => r.value ? this.transferBuffer.addInt8Array(r.value) : () => console.log("timeout") )
            .finally(() => reader?.releaseLock());

        clearTimeout(timer);
    }
}

