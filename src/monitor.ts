#!/usr/bin/env node
import config from "./config.json";

// startHomeassitantMQTTService(config.mqttUrl, "121001123020216");
// startHomeassitantMQTTService(config.mqttUrl, "1220020DA00217");
// startHomeassitantMQTTService(config.mqttUrl, config.user, config.password)

import { UltimatronBattery, BatteryState } from "./battery";
const mqtt = require("mqtt");

const options = {
  clean: true,
  connectTimeout: 4000,
  clientId: "Ultimatron poller",
  // username: username,
  // password: password
};

const client = mqtt.connect(config.mqttUrl, options);

function batteryDiscoveredHA(battery: UltimatronBattery) {
  const batteryName = battery.commonName;
  // console.log(
  //   "[mqtt] Publishing to config topic: ",
  //   `homeassistant/sensor/${battery.name}_capacity/config`
  // );

  client.publish(
    `homeassistant/sensor/${battery.name}_capacity/config`,
    JSON.stringify({
      name: `Ultimatron ${batteryName} percentage, %`,
      unit_of_measurement: "%",
      device_class: "battery",
      state_topic: `homeassistant/sensor/${battery.name}_capacity/state`,
      unique_id: `${battery.name}_capacity`,
      device: {
        identifiers: [battery.name],
        name: `Ultimatron battery ${battery.name}`,
      },
    })
  );

  // console.log(
  //   "[mqtt] Publishing to config topic: ",
  //   `homeassistant/sensor/${battery.name}_power/config`
  // );

  client.publish(
    `homeassistant/sensor/${battery.name}_power/config`,
    JSON.stringify({
      name: `Ultimatron ${batteryName} power, W`,
      device_class: "power",
      unit_of_measurement: "W",
      state_topic: `homeassistant/sensor/${battery.name}_power/state`,
      unique_id: `${battery.name}_power`,
      device: {
        identifiers: [battery.name],
        name: `Ultimatron battery ${battery.name}`,
      },
    })
  );

  client.publish(
    `homeassistant/sensor/${battery.name}_current/config`,
    JSON.stringify({
      name: `Ultimatron ${batteryName} current, A`,
      device_class: "current",
      unit_of_measurement: "A",
      state_topic: `homeassistant/sensor/${battery.name}_current/state`,
      unique_id: `${battery.name}_current`,
      device: {
        identifiers: [battery.name],
        name: `Ultimatron battery ${battery.name}`,
      },
    })
  );

  client.publish(
    `homeassistant/sensor/${battery.name}_voltage/config`,
    JSON.stringify({
      name: `Ultimatron ${batteryName} voltage, V`,
      device_class: "voltage",
      unit_of_measurement: "V",
      state_topic: `homeassistant/sensor/${battery.name}_voltage/state`,
      unique_id: `${battery.name}_voltage`,
      device: {
        identifiers: [battery.name],
        name: `Ultimatron battery ${battery.name}`,
      },
    })
  );

  client.publish(
    `homeassistant/sensor/${battery.name}_actual_capacity/config`,
    JSON.stringify({
      name: `Ultimatron ${batteryName} actual capacity, Ah`,
      device_class: "energy",
      unit_of_measurement: "Ah",
      state_topic: `homeassistant/sensor/${battery.name}_actual_capacity/state`,
      unique_id: `${battery.name}_actual_capacity`,
      device: {
        identifiers: [battery.name],
        name: `Ultimatron battery ${battery.name}`,
      },
    })
  );

  client.publish(
    `homeassistant/sensor/${battery.name}_design_capacity/config`,
    JSON.stringify({
      name: `Ultimatron ${batteryName} design capacity, Ah`,
      device_class: "energy_storage",
      unit_of_measurement: "Ah",
      state_topic: `homeassistant/sensor/${battery.name}_design_capacity/state`,
      unique_id: `${battery.name}_design_capacity`,
      device: {
        identifiers: [battery.name],
        name: `Ultimatron battery ${battery.name}`,
      },
    })
  );

  client.publish(
    `homeassistant/sensor/${battery.name}_temperature/config`,
    JSON.stringify({
      name: `Ultimatron ${batteryName} temperature, °C`,
      device_class: "temperature",
      unit_of_measurement: "°C",
      state_topic: `homeassistant/sensor/${battery.name}_temperature/state`,
      unique_id: `${battery.name}_temperature`,
      device: {
        identifiers: [battery.name],
        name: `Ultimatron battery ${battery.name}`,
      },
    })
  );

  // console.log(
  //   "[mqtt] Publishing to config topic: ",
  //   `homeassistant/switch/${battery.name}_discharge/config`
  // );

  client.publish(
    `homeassistant/switch/${battery.name}_discharge/config`,
    JSON.stringify({
      name: `Ultimatron ${batteryName} discharge switch`,
      state_topic: `homeassistant/switch/${battery.name}_discharge/state`,
      command_topic: `homeassistant/switch/${battery.name}_discharge/set`,
      unique_id: `${battery.name}_discharge`,
      device: {
        identifiers: [battery.name],
        name: `Ultimatron battery ${battery.name}`,
      },
    })
  );

  client.publish(
    `homeassistant/switch/${battery.name}_charge/config`,
    JSON.stringify({
      name: `Ultimatron ${batteryName} charge switch`,
      state_topic: `homeassistant/switch/${battery.name}_charge/state`,
      command_topic: `homeassistant/switch/${battery.name}_charge/set`,
      unique_id: `${battery.name}_charge`,
      device: {
        identifiers: [battery.name],
        name: `Ultimatron battery ${battery.name}`,
      },
    })
  );
}

function subscribeToBatteryChanges(battery: UltimatronBattery) {
  client.subscribe(
    `homeassistant/switch/${battery.name}_discharge/set`,
    async (err: Error) => {
      console.log("[mqtt] Subscribed to discharge events", err);

      client.on("message", (topic: string, message: Buffer) => {
        console.log("[mqtt]> " + topic, message.toString("utf8"));
        const on = message.toString("utf8") === "ON";
        if (topic == `homeassistant/switch/${battery.name}_discharge/set`) {
          console.log("[mqtt] Toggling battery discharge switch");
          battery.toggleDischarging(on);
          // Immediately notify about state otherwise Homeassist will revert the toggle state
          // later it will be updated with actual value
          client.publish(
            `homeassistant/switch/${battery.name}_discharge/state`,
            on ? "ON" : "OFF"
          );
        } else {
          console.log(`[mqtt] Ignoring message on topic ${topic}`);
        }
      });
    }
  );
}

function publishBatteryStateHA(
  battery: UltimatronBattery,
  state: BatteryState
) {
  const power = (state.voltage * state.current).toFixed(2);
  console.log(
    "Publish",
    battery.commonName,
    `${state.residualCapacityPercent.toString()} %, ${state.current
      .toFixed(2)
      .toString()} A, ${state.residualCapacity.toString()} Ah, ${state.powerDrain.toString()} W`
  );

  client.publish(
    `homeassistant/sensor/${battery.name}_capacity/state`,
    state.residualCapacityPercent.toString()
  );
  client.publish(
    `homeassistant/sensor/${battery.name}_current/state`,
    state.current.toFixed(2).toString()
  );
  client.publish(
    `homeassistant/sensor/${battery.name}_voltage/state`,
    state.voltage.toFixed(2).toString()
  );
  client.publish(
    `homeassistant/sensor/${battery.name}_actual_capacity/state`,
    state.residualCapacity.toFixed(1).toString()
  );
  client.publish(
    `homeassistant/sensor/${battery.name}_design_capacity/state`,
    state.standardCapacity.toString()
  );
  client.publish(
    `homeassistant/sensor/${battery.name}_power/state`,
    power.toString()
  );
  client.publish(
    `homeassistant/switch/${battery.name}_discharge/state`,
    state.status.discharing ? "ON" : "OFF"
  );
  client.publish(
    `homeassistant/switch/${battery.name}_charge/state`,
    state.status.charging ? "ON" : "OFF"
  );
  client.publish(
    `homeassistant/sensor/${battery.name}_temperature/state`,
    state.temperatures[0]?.toFixed(2)?.toString()
  );
}

async function updateDatas(batteries: UltimatronBattery[]) {
  await batteries[0].polling();
  const state1 = await batteries[0].getLastState();
  if (state1) publishBatteryStateHA(batteries[0], state1);
  // console.log(batteries[0].name, state1);

  await batteries[1].polling();
  const state2 = await batteries[1].getLastState();
  if (state2) publishBatteryStateHA(batteries[1], state2);
  // console.log(batteries[1].name, state2);
}

(async () => {
  const batteries = await UltimatronBattery.findAll(
    60000,
    2,
    false,
    10 * 60 * 1000
  );

  if (batteries.length < 2) {
    console.error("Not enough batteries found");
    return;
  }

  if (batteries[0].name.includes("217")) {
    const tmp = batteries[0];
    batteries[0] = batteries[1];
    batteries[1] = tmp;
  }

  batteries[0].commonName = "100Ah";
  batteries[1].commonName = "200Ah";

  // console.log(batteries);

  console.log("Starting Monitor");

  batteryDiscoveredHA(batteries[0]);
  subscribeToBatteryChanges(batteries[0]);

  batteryDiscoveredHA(batteries[1]);
  subscribeToBatteryChanges(batteries[1]);

  await updateDatas(batteries);
  setInterval(async () => {
    await updateDatas(batteries);
  }, 2 * 60 * 1000);

  client.subscribe(`ultimatron`, async (err: Error) => {
    console.log("[mqtt] Subscribed to discharge events", err);

    client.on("message", (topic: string, message: Buffer) => {
      // console.log("[mqtt]> " + topic, message.toString("utf8"));
      if (message.toString("utf8") === "reload") {
        console.log("Refetch data");
        updateDatas(batteries);
      }
    });
  });

  // batteries[0].onStateUpdate(async (state: BatteryState) => {
  //   console.log("[mqtt] status updated");
  //   console.log(batteries[0].name, state);
  //   // await publishBatteryStateHA(battery, state);
  //   publishBatteryStateHA(batteries[0], state);
  // });

  // batteries[1].onStateUpdate(async (state: BatteryState) => {
  //   console.log("[mqtt] status updated");
  //   console.log(batteries[0].name, state);
  //   publishBatteryStateHA(batteries[1], state);
  //   // await publishBatteryStateHA(battery, state);
  // });

  //   batteries.forEach(async (battery) => {
  //     // await startHomeassitantMQTTService(config.mqttUrl, battery.name);
  //     await battery.onStateUpdate(async (state: BatteryState) => {
  //       console.log("[mqtt] status updated");
  //       console.log(battery, state);
  //       // await publishBatteryStateHA(battery, state);
  //     });
  //   });

  // const battery100 = await UltimatronBattery.forName(
  //     "121001123020216",
  //     false,
  //     10 * 60 * 1000
  //     );

  //     battery100.

  //       const battery200 = await UltimatronBattery.forName(
  //         "1220020DA00217",
  //         false,
  //         10 * 60 * 1000
  //       );
})();
