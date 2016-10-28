homebridge-functor
==================

```
THIS MODULE DOESN'T WORK YET
```

Sometimes you just want to connect something simple to HomeKit (or Alexa). homebridge-functor allows
you to do this with "middleware-like" configuration. You just list out your devices, point
them to the functions that implement getter/setters for the properties, and you're done. The
library is Promise-aware, so you can use fancy ES7 async/await to make it look better.

```
// mySwitch.js
export async function getPower(device) {
    await Promise.delay(1); // This is just a simulation
    console.log(`getPower called for ${device.name}`);
    return true;
}

export async function setPower(device, value) {
    await Promise.delay(1);
    console.log(`setPower ${value} called for ${device.name}`);
    return;
}
```

And the corresponding portion of HomeKit config.json
```
{
  "platform": "Functor",
  "devices": [{
      "name": "Fake Switch",
      "serial": "12345678",
      "module": "func:./mySwitch.js"
  }, {
      "name": "Other Fake Switch",
      "serial": "212345678",
      "getPower": "func:./mySwitch.js#getPower",
      "setPower": "func:./mySwitch.js#setPower"
  }]
}
```

Now you can say "Hey Siri, turn the fake switch on." The two devices above are just two ways of
expressing the same thing; the first being a monolithic module that implements all the events,
the second being one function at a time. You can also specify event handlers (only the onCreate
event exists so far).