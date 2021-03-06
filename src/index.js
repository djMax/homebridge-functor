import _ from 'lodash';
import path from 'path';
import { EventEmitter } from 'events';
import shortstop from 'shortstop';
import handlers from 'shortstop-handlers';
import request from 'superagent';
import compile from 'es6-template-strings/compile';
import resolveToString from 'es6-template-strings/resolve-to-string';
import jsonpath from 'JSONPath';

let dogs = 0;

let Service;
let Characteristic;

/**
 * Make sure fn gets called exactly once after no more than maxTime
 */
function watchDog(name, maxTime, context, fn) {
  const start = Date.now();
  dogs++;
  let wasDone = false;
  setTimeout(() => {
    if (!wasDone) {
      wasDone = true;
      dogs--;
      context.log(`${name} watch dog kicked after ${maxTime} (${dogs})`);
      fn();
    }
  }, maxTime);
  return (...cbArgs) => {
    const time = Date.now() - start;
    if (!wasDone) {
      wasDone = true;
      dogs--;
      context.log(`${name} completed in ${time}ms (${dogs})`);
      fn(...cbArgs);
    } else {
      context.log(`${name} callback took too long ${time}ms (${dogs})`);
    }
  };
}

class FunctorItem {
  constructor(log, config, platform) {
    this.config = config;
    this.log = log;
    this.platform = platform;
    this.name = config.name;
    const onCreate = config.onCreate || (config.module && config.module.onCreate);
    if (onCreate) {
      onCreate(this);
    }
  }

  get(setting, callback) {
    const member = `get${_.upperFirst(setting)}`;
    const fn = this.config[member] || (this.config.module && this.config.module[member]);
    const watcher = watchDog(member, this.config.timeout || 5000, this, callback);
    if (typeof fn !== 'function') {
      this.log(`Failed to ${member}: configuration value is not a function (${typeof fn}).`);
      watcher();
      return;
    }
    const maybePromise = fn(this, watcher);
    if (maybePromise instanceof Promise) {
      maybePromise
        .then((rz) => watcher(null, rz))
        .catch((e) => {
          this.log(`Failed to ${member}: ${e.message}\n${e.stack}`);
          watcher();
        });
    }
  }

  set(setting, value, callback) {
    const member = `set${_.upperFirst(setting)}`;
    const fn = this.config[member] || this.config.module[member];
    const watcher = watchDog(member, this.config.timeout || 5000, this, callback);
    const maybePromise = fn(this, value, watcher);
    if (maybePromise instanceof Promise) {
      maybePromise
        .then(rz => watcher(null, rz))
        .catch((e) => {
          this.log.error(`Failed to ${member}: ${e.message}\n${e.stack}`);
          watcher();
        });
    }
  }

  getServices() {
    const services = [];
    this.service = new Service.Lightbulb(this.name);

    this.service.getCharacteristic(Characteristic.On)
      .on('get', (callback) => {
        this.get('power', callback);
      })
      .on('set', (value, callback) => {
        this.set('power', value, callback);
      });

    if (this.config.types && this.config.types.includes('dimmer')) {
      this.service.addCharacteristic(Characteristic.Brightness)
        .on('get', (callback) => {
          this.get('brightness', callback);
        })
        .on('set', (value, callback) => {
          this.set('brightness', value, callback);
        });
    }

    services.push(this.service);

    const service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Manufacturer, this.config.manufacturer || 'GENERIC')
      .setCharacteristic(Characteristic.Model, this.config.model)
      .setCharacteristic(Characteristic.SerialNumber, this.config.serial);
    services.push(service);

    return services;
  }
}

function functorShortstop(basedir) {
  const requireFn = handlers.require(basedir);
  return function execHandler(value) {
    const tuple = value.split('#');
    const module = requireFn(tuple[0]);
    return tuple[1] ? module[tuple[1]] : module;
  };
}

function getUrlShortstop(urlTemplate) {
  const template = compile(urlTemplate);
  return function urlHandler(device, arg2, arg3) {
    const callback = typeof arg2 === 'function' ? arg2 : arg3;
    const value = typeof arg2 === 'function' ? null : arg2;
    const [url, pathspec] = resolveToString(template, { value, device }).split('#');
    request
      .get(url)
      .end((error, result) => {
        if (error) {
          callback(error);
          return;
        }
        if (pathspec) {
          const extracted = jsonpath({
            json: result.body,
            path: pathspec,
            wrap: false,
          });
          callback(null, extracted);
        }
      });
  };
}

class FunctorPlatform extends EventEmitter {
  constructor(log, config) {
    super();
    this.setMaxListeners(0);
    log('Functor Platform Created');
    this.config = config;
    this.log = log;
    module.exports.platforms[config.name || 'default'] = this;
  }

  accessories(callback) {
    const resolver = shortstop.create();
    const appDir = path.dirname(require.main.filename);
    resolver.use('func', functorShortstop(appDir));
    resolver.use('getUrl', getUrlShortstop);
    resolver.resolve(this.config, (error, resolved) => {
      const items = resolved.devices.map(d => new FunctorItem(this.log, d, this));
      this.accessories = items;
      callback(items);
    });
  }
}

function Homebridge(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-functor-item', 'FunctorItem', FunctorItem);
  homebridge.registerPlatform('homebridge-functor', 'Functor', FunctorPlatform);
}

Homebridge.accessory = FunctorItem;
Homebridge.platform = FunctorPlatform;
Homebridge.platforms = {};

module.exports = Homebridge;
