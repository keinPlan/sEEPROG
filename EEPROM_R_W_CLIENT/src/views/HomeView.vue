
<template>
  <v-container class="fill-height" fluid>
    <v-app-bar>

      <v-btn @click="connect()" variant="tonal" icon="mdi-power-plug" color="primary" v-if="!seeprogConnection" />
      <v-btn @click="disconnect()" variant="tonal" icon="mdi-power-plug-off" color="red" v-if="seeprogConnection" />

      <v-app-bar-title>sEEProg</v-app-bar-title>
    </v-app-bar>

    <v-overlay v-model="overlay" width="100%" height="100%" class="align-center justify-center" contained>

      <v-card class="ma-5 pa-5">
        <v-card-title> {{ commandResult?.msg }}</v-card-title>
        <v-textarea label="Details" rows="20" :model-value="commandResult?.detail" />
        <v-btn color="orange lighten-2" @click="overlay = !overlay" block>Close</v-btn>
      </v-card>



    </v-overlay>
    <v-col>



      <v-row v-if="seeprogConnection">
        <v-col class="d-flex   mb-8  ">
          <v-textarea label="EEPROM DATA:" rows="20" auto-grow:false no-resize v-model:model-value="eepromData" />
        </v-col>
        <v-col class="  mb-4  ">
          <v-row>
            <v-card class="ma-2  mb-6 ">
              <v-card-title>EEprom Config</v-card-title>
              <v-card-item>
                <v-text-field label="ClockSpeed[Hz]" type="number" v-model.number="eepromConfig.ClockSpeedHz"></v-text-field>
                <v-text-field label="eepromBusAddress" type="number" v-model.number="eepromConfig.EEpromBusAddress"></v-text-field>
                <v-text-field label="eerpomAddressSize" type="number" v-model.number="eepromConfig.EEpromAddressSize"></v-text-field>
                <v-text-field label="eerpomWriteBufferSize" type="number" v-model.number="eepromConfig.EEpromWriteBufferSize"></v-text-field>
                <v-text-field label="EEpromWriteDelay" type="number" v-model.number="eepromConfig.EEpromWriteDelay"></v-text-field>
              </v-card-item>
              <v-card-actions>
                <v-btn block color="primary" variant="tonal" @click="setEEpromConfig">SET</v-btn>
              </v-card-actions>
            </v-card>

            <v-card class="ma-2  mb-6 ">
              <v-card-title>Read/Write</v-card-title>
              <v-card-item>
                <v-text-field label="Address" type="number" v-model.number="rwAddress"></v-text-field>
                <v-text-field label="ByteCount" type="number" v-model.number="rwByteCount"></v-text-field>
                <v-text-field label="writeTimout" type="number" v-model.number="writeTimout"></v-text-field>


              </v-card-item>
              <v-card-actions>
                <v-btn color="primary" variant="tonal" @click="readEEprom">Read</v-btn>
                <v-btn color="primary" variant="tonal" @click="writeEEprom">Write</v-btn>
                <v-btn color="primary" variant="tonal" @click="verifyEEprom">Verify</v-btn>
              </v-card-actions>
            </v-card>
          </v-row>
        </v-col>

      </v-row>

      <v-footer app bottom absolute padless>
        <v-alert v-if="commandResult" :type="commandResult.isError ? 'error' : 'success'">
          {{ commandResult.msg }}
        </v-alert>



      </v-footer>
    </v-col>



  </v-container>
</template>

<script lang="ts">

import { SeeProg, EEPromConfig } from "@/seeProg";
import { ref, computed } from "vue";

interface CommadnResult {
  msg: string;
  detail?: string;
  isError: boolean;
}

export default {
  setup() {

    const seeprog = ref<null | SeeProg>(null);
    const commandResult = ref<null | CommadnResult>(null);
    const overlay = ref(false);
    const writeTimout = ref(1000);


    const eepromData = ref("");

    const eepromConfig = ref<EEPromConfig>({
      ClockSpeedHz: 400000,
      EEpromAddressSize: 2,
      EEpromBusAddress: 0xa0,
      EEpromWriteBufferSize: 64,
      EEpromWriteDelay: 10,
    });
    const rwAddress = ref(0);
    const rwByteCount = ref(10);


    function disconnect() {
      seeprog.value?.close();
      seeprog.value = null;
    }

    async function connect() {

      var webserial = navigator.serial;

      // eslint-disable-next-line
      let port: SerialPort | null;
      port = await webserial.requestPort()
        .then((p) => port = p)
        .catch(e => {
          commandResult.value = { msg: e, isError: true };
          return null;
        });

      if (!port)
        return;

      await port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        bufferSize: 0x2000
      });

      var seeporg = new SeeProg(port);

      seeporg.SetConfig(eepromConfig.value).then((r) => {
        commandResult.value = { msg: "SetEEpromConfig: OK", isError: false }
        seeprog.value = seeporg;
      }).catch((e) => {
        commandResult.value = { msg: "SetEEpromConfig ERROR => wrong port selected?", isError: true };
        seeporg.close();
        seeprog.value = null;
      });
    }

    async function setEEpromConfig() {
      await seeprog.value?.SetConfig(eepromConfig.value)
        .then(r => commandResult.value = { msg: "SetEEpromConfig: OK", isError: false })
        .catch(e => commandResult.value = { msg: "SetEEpromConfig ERROR => " + e, isError: true });
    }

    async function readEEprom() {

      eepromData.value = "";
      var address = rwAddress.value;
      var bCount = rwByteCount.value


      seeprog.value?.ReadEEprom(address, bCount)
        .then((data) => {
          eepromData.value += Array.from(data, x => x.toString(16).toLocaleUpperCase().padStart(2, '0')).join(" ") + " ";
          commandResult.value = { msg: `ReadEEprom: OK`, isError: false };
        }).catch(e => commandResult.value = { msg: "ReadEEprom ERROR => " + e, isError: true });



    }

    async function writeEEprom() {
      commandResult.value = null;
      var data = eepromDataToArray();
      var address = rwAddress.value;
      var bCount = rwByteCount.value

      if (!data) {
        commandResult.value = { msg: "ERROR: readData undefined", isError: true };
        return;
      }

      if (data.length != bCount) {
        commandResult.value = { msg: "ERROR: data.length != bCount", isError: true };
        return;
      }
      if (!seeprog.value) {
        commandResult.value = { msg: "ERROR: !seeprog", isError: true };
        return;
      }

      let result = await seeprog.value.WriterEEprom(address, data, writeTimout.value)
        .then((x) => { return { msg: "writeEEprom OK ", isError: false }; })
        .catch((e) => { return { msg: "writeEEprom ERROR => " + e, isError: true }; });

      commandResult.value = result;

    }

    async function verifyEEprom() {
      commandResult.value = null;
      var expecteddata = eepromDataToArray();
      var address = rwAddress.value;
      var bCount = rwByteCount.value
      var result: CommadnResult = { msg: "VerifyEEprom => Missmatch !!!", isError: false, detail: "" }

      var currentData = await seeprog.value?.ReadEEprom(address, bCount);

      if (!currentData) {
        commandResult.value = { msg: "ERROR: readData undefined", isError: true };
        return;
      }
      if (currentData.length != expecteddata.length) {
        commandResult.value = { msg: "ERROR: currentData.length != expecteddata.length", isError: true };
        return;
      }


      for (let i = 0; i < currentData.length; i++) {
        if (currentData[i] != expecteddata[i]) {
          result.isError = true;
          result.detail += `data missmatch => add:0x${(address + i).toString(16).padStart(4, '0')} E:0x${expecteddata[i].toString(16).padStart(2, '0')} C:0x${currentData[i].toString(16).padStart(2, '0')}\n`
          console.log(`data missmatch => add:0x${(address + i).toString(16).padStart(4, '0')} E:0x${expecteddata[i].toString(16).padStart(2, '0')} C:0x${currentData[i].toString(16).padStart(2, '0')}`)
        }
      }

      if (result.isError) {
        result.msg = "VerifyEEprom => Missmatch !!!";
      } else {
        result.msg = "VerifyEEprom => OK";
      }

      commandResult.value = result;
      overlay.value = result.isError;
    }

    function eepromDataToArray(): Uint8Array {
      var data = eepromData.value;

      data = data.replaceAll(" ", "").replaceAll("\n", "").replaceAll("\r", "");

      if (data.length % 2 != 0) {
        commandResult.value = { msg: "Error parse EEPROM DATA", isError: true };
        throw "Error parse EEPROM DATA";
      }

      var byteArray = new Uint8Array(data.length / 2);
      var stringStart = 0;
      var stringEnd = 0;

      for (let index = 0; index < byteArray.length; index++) {
        stringStart = index * 2;
        stringEnd = stringEnd + 2;
        byteArray[index] = Number.parseInt(data.slice(stringStart, stringEnd), 16)
      }

      return byteArray;
    }


    return { writeTimout, overlay, setEEpromConfig, readEEprom, writeEEprom, verifyEEprom, connect, disconnect, eepromData, commandResult, seeprogConnection: seeprog, eepromConfig, rwAddress, rwByteCount };
  }
};

</script>


<style scoped lang="scss">

</style>