"use strict";

// Use the Azure IoT device SDK for devices that connect to Azure IoT Central.
var iotHubTransport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').Client;
var Message = require('azure-iot-device').Message;
var ProvisioningTransport = require('azure-iot-provisioning-device-mqtt').Mqtt;
var SymmetricKeySecurityClient = require('azure-iot-security-symmetric-key').SymmetricKeySecurityClient;
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;
var provisioningHost = 'global.azure-devices-provisioning.net';
var idScope = '0ne00096EE5';
var registrationId = 'a65094c4-a6cd-497f-b2a8-a4e929cae1ff';
var symmetricKey = '+VxHM0Edw4D+hoDZ2jxElbtU2XvyCF7i5+I3CpLC0DE=';
var provisioningSecurityClient = new SymmetricKeySecurityClient(registrationId, symmetricKey);
var provisioningClient = ProvisioningDeviceClient.create(provisioningHost, idScope, new ProvisioningTransport(), provisioningSecurityClient);
var hubClient;
var ledOn = true;

var rpio = require('rpio');
const SerialPort = require('serialport');


// ラズパイPin
var pin = 15; 

// GPIOセットアップ
rpio.open(pin, rpio.INPUT, rpio.PULL_UP);


const Readline = require('@serialport/parser-readline');

const port = new SerialPort('/dev/ttyAMA0', {
    baudRate: 9600,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    flowControl: false
});

const parser = port.pipe(new Readline({ delimiter: '\r\n' }));


function parse(data) {
    var latitude = 0;
    var longitude = 0;
    var lat = data[3].split('.');
    var lat_deg = parseFloat(String(Math.floor(lat[0] / 100)));
    var lat_min = parseFloat(String(lat[0] % 100) + "." + lat[1]);
    latitude = lat_deg + (lat_min / 60)

    var lng = data[5].split('.');
    var lng_deg = parseFloat(String(Math.floor(lng[0] / 100)));
    var lng_min = parseFloat(String(lng[0] % 100) + "." + lng[1]);
    longitude = lng_deg + (lng_min / 60);

    return { latitude, longitude };
}

// Send device twin reported properties.
function sendDeviceProperties(twin, properties) {
    twin.properties.reported.update(properties, (err) => console.log(`Sent device properties: ${JSON.stringify(properties)}; ` +
        (err ? `error: ${err.toString()}` : `status: success`)));
}


// Add any writeable properties your device supports,
// mapped to a function that's called when the writeable property
// is updated in the IoT Central application.
var writeableProperties = {
    'name': (newValue, callback) => {
        setTimeout(() => {
            callback(newValue, 'completed');
        }, 1000);
    },
    'brightness': (newValue, callback) => {
        setTimeout(() => {
            callback(newValue, 'completed');
        }, 5000);
    }
};

// Handle writeable property updates that come from IoT Central via the device twin.
function handleWriteablePropertyUpdates(twin) {
    twin.on('properties.desired', function (desiredChange) {
        for (let setting in desiredChange) {
            if (writeableProperties[setting]) {
                console.log(`Received setting: ${setting}: ${desiredChange[setting].value}`);
                writeableProperties[setting](desiredChange[setting].value, (newValue, status) => {
                    var patch = {
                        [setting]: {
                            value: newValue,
                            status: status,
                            desiredVersion: desiredChange.$version
                        }
                    }
                    sendDeviceProperties(twin, patch);
                });
            }
        }
    });
}










// Setup command handlers
function setupCommandHandlers(twin) {

    // Handle synchronous LED blink command with request and response payload.
    function onBlink(request, response) {
        console.log('Received synchronous call to blink');
        var responsePayload = {
            status: 'Blinking LED every ' + request.payload + ' seconds'
        }
        response.send(200, responsePayload, (err) => {
            if (err) {
                console.error('Unable to send method response: ' + err.toString());
            } else {
                console.log('Blinking LED every ' + request.payload + ' seconds');
            }
        });
    }

    // Handle synchronous LED turn on command
    function turnOn(request, response) {
        console.log('Received synchronous call to turn on LED');
        if (!ledOn) {
            console.log('Turning on the LED');
            ledOn = true;
        }
        response.send(200, (err) => {
            if (err) {
                console.error('Unable to send method response: ' + err.toString());
            }
        });
    }

    // Handle synchronous LED turn off command
    function turnOff(request, response) {
        console.log('Received synchronous call to turn off LED');
        if (ledOn) {
            console.log('Turning off the LED');
            ledOn = false;
        }
        response.send(200, (err) => {
            if (err) {
                console.error('Unable to send method response: ' + err.toString());
            }
        });
    }

    // Handle asynchronous sensor diagnostics command with response payload.
    function diagnostics(request, response) {
        console.log('Starting asynchronous diagnostics run...');
        response.send(202, (err) => {
            if (err) {
                console.error('Unable to send method response: ' + err.toString());
            } else {
                var repetitions = 3;
                var intervalID = setInterval(() => {
                    console.log('Generating diagnostics...');
                    if (--repetitions === 0) {
                        clearInterval(intervalID);
                        var properties = {
                            rundiagnostics: {
                                value: 'Diagnostics run complete at ' + new Date().toLocaleString()
                            }
                        };
                        sendDeviceProperties(twin, properties);
                    }
                }, 2000);
            }
        });
    }

    hubClient.onDeviceMethod('blink', onBlink);
    hubClient.onDeviceMethod('turnon', turnOn);
    hubClient.onDeviceMethod('turnoff', turnOff);
    hubClient.onDeviceMethod('rundiagnostics', diagnostics);
}




// Handle device connection to Azure IoT Central.
var connectCallback = (err) => {
    if (err) {
        console.log(`Device could not connect to Azure IoT Central: ${err.toString()}`);
    } else {
        console.log('Device successfully connected to Azure IoT Central');


        // IoTCentralに送信
        parser.on('data', function (data) {

          var state = rpio.read(pin) ? on : off;

          if (data.indexOf('$GPRMC') !== -1) {

            if(state == off){
              var data = JSON.stringify({
                state: state
              });

              var message = new Message(data);
              hubClient.sendEvent(message, (err, res) => console.log(`Sent message: ${message.getData()}` +
              (err ? `; error: ${err.toString()}` : '') +
              (res ? `; status: ${res.constructor.name}` : '')));

            } else if(state == on){
              const gpsData = parse(data.split(','));
      
              var data = JSON.stringify({
                state: state,
                Location: {
                    lat: gpsData.latitude,
                    lon: gpsData.longitude
                  }
               });
               var message = new Message(data);
               hubClient.sendEvent(message, (err, res) => console.log(`Sent message: ${message.getData()}` +
               (err ? `; error: ${err.toString()}` : '') +
               (res ? `; status: ${res.constructor.name}` : '')));
            }
          }
        });

        // Get device twin from Azure IoT Central.
        hubClient.getTwin((err, twin) => {
            if (err) {
                console.log(`Error getting device twin: ${err.toString()}`);
            } else {
                // Send device properties once on device start up.
                var properties = {
                    state: 'true'
                };
                sendDeviceProperties(twin, properties);

                handleWriteablePropertyUpdates(twin);

                setupCommandHandlers(twin);
            }
        });
    }
};

// Start the device (register and connect to Azure IoT Central).
provisioningClient.register((err, result) => {
    if (err) {
        console.log('Error registering device: ' + err);
    } else {
        console.log('Registration succeeded');
        console.log('Assigned hub=' + result.assignedHub);
        console.log('DeviceId=' + result.deviceId);
        var connectionString = 'HostName=' + result.assignedHub + ';DeviceId=' + result.deviceId + ';SharedAccessKey=' + symmetricKey;
        hubClient = Client.fromConnectionString(connectionString, iotHubTransport);

        hubClient.open(connectCallback);
    }
});
