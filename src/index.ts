#!/usr/bin/env node
import startHomeassitantMQTTService from './homeassist-mqtt'
import config from './config.json'

startHomeassitantMQTTService(config.mqttUrl);
// startHomeassitantMQTTService(config.mqttUrl, config.user, config.password)

// import { UltimatronBattery, BatteryState } from "./battery";
// const mqtt = require('mqtt');

// const logBattery = (battery: any, state: any) => {
//   console.log(battery, state);
// };
