import {UltimatronBattery, BatteryState} from './battery'
const mqtt = require('mqtt');

export default function startHomeassitantMQTTService(mqttUrl: string) {
  const options = {
    clean: true,
    connectTimeout: 4000,
    clientId: "Ultimatron poller",
    // username: username,
    // password: password
  };

  const client = mqtt.connect(mqttUrl, options);

  console.log("Created a MQTT client");

  async function batteryDiscoveredHA(battery: UltimatronBattery) {
    console.log(
      "[mqtt] Publishing to config topic: ",
      `homeassistant/sensor/${battery.name}_capacity/config`
    );

    await client.publish(
      `homeassistant/sensor/${battery.name}_capacity/config`,
      JSON.stringify({
        name: "Ultimatron battery remaining capacity",
        device_class: "battery",
        state_topic: `homeassistant/sensor/${battery.name}_capacity/state`,
        unique_id: `${battery.name}_capacity`,
        device: {
          identifiers: [battery.name],
          name: `Ultimatron battery ${battery.name}`,
        },
      })
    );

    console.log(
      "[mqtt] Publishing to config topic: ",
      `homeassistant/sensor/${battery.name}_power/config`
    );

    await client.publish(
      `homeassistant/sensor/${battery.name}_power/config`,
      JSON.stringify({
        name: "Ultimatron battery power drain, W",
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

    console.log(
      "[mqtt] Publishing to config topic: ",
      `homeassistant/switch/${battery.name}_discharge/config`
    );

    await client.publish(
      `homeassistant/switch/${battery.name}_discharge/config`,
      JSON.stringify({
        name: "Ultimatron battery discharge switch",
        state_topic: `homeassistant/switch/${battery.name}_discharge/state`,
        command_topic: `homeassistant/switch/${battery.name}_discharge/set`,
        unique_id: `${battery.name}_discharge`,
        device: {
          identifiers: [battery.name],
          name: `Ultimatron battery ${battery.name}`,
        },
      })
    );

    return true;
  }

  async function subscribeToBatteryChanges(battery: UltimatronBattery) {
    return await client.subscribe(
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

  async function publishBatteryStateHA(
    battery: UltimatronBattery,
    state: BatteryState
  ) {
    await client.publish(
      `homeassistant/sensor/${battery.name}_capacity/state`,
      state.residualCapacityPercent.toString()
    );
    await client.publish(
      `homeassistant/sensor/${battery.name}_power/state`,
      state.powerDrain.toString()
    );
    await client.publish(
      `homeassistant/switch/${battery.name}_discharge/state`,
      state.status.discharing ? "ON" : "OFF"
    );
  }

  client.on("connect", async () => {
    console.log("[mqtt] Connected to broker");

    const battery200 = await UltimatronBattery.forName(
      "1220020DA00217",
      false,
      10 * 60 * 1000
    );
    await batteryDiscoveredHA(battery200);
    await subscribeToBatteryChanges(battery200);

    const battery100 = await UltimatronBattery.forName(
      "121001123020216",
      false,
      10 * 60 * 1000
    );

    await batteryDiscoveredHA(battery100);
    await subscribeToBatteryChanges(battery100);

    await battery100.onStateUpdate(async (state: BatteryState) => {
      console.log("[mqtt] status updated");
      await publishBatteryStateHA(battery100, state);
    });

    await battery200.onStateUpdate(async (state: BatteryState) => {
      console.log("[mqtt] status updated");
      await publishBatteryStateHA(battery200, state);
    });

    // const batteries = await UltimatronBattery.findAll(60000, 2, true, 10*60*1000)
    // const batteries = [battery100, battery200];
    // console.log(
    //   "[mqtt] Found batteries: ",
    //   batteries.map((b) => b.name)
    // );

    // batteries.forEach((battery) => {
    //   batteryDiscoveredHA(battery);
    //   subscribeToBatteryChanges(battery);

    //   battery.onStateUpdate((state: BatteryState) => {
    //     console.log("[mqtt] status updated");
    //     publishBatteryStateHA(battery, state);
    //   });
    // });
  });
}