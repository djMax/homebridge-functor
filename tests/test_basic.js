import tap from 'tap';
import url from 'url';
import http from 'http';
import hbfunc from '../src/index';

const Functor = hbfunc.platform;

process.on('uncaughtException', (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(-1);
});

let fn;
let accessories;
let server;
let lastResult;

tap.test('create http server', (t) => {
  server = http.createServer((req, res) => {
    const { query } = url.parse(req.url, true);
    res.setHeader('Content-Type', 'application/json');
    const body = lastResult = {
      foo: {
        bar: 50,
        baz: query.foo,
      },
      query,
    };
    res.end(JSON.stringify(body));
  });
  server.listen(0, () => {
    t.end();
  });
});

tap.test('configure', (t) => {
  // eslint-disable-next-line no-console
  fn = new Functor((m) => console.log(m), {
    devices: [{
      name: 'Test Device 1',
      getPower: (device, cb) => cb(null, true),
      getBrightness: `getUrl:http://localhost:${server.address().port}/get?foo=boo#$.foo.bar`,
      setBrightness: `getUrl:http://localhost:${server.address().port}/get?level=$\{value}&name=$\{encodeURIComponent(device.name)}`,
    }],
  });
  fn.accessories((a) => {
    accessories = a;
    t.end();
  });
});

tap.test('get power', (t) => {
  accessories[0].get('power', (error, p) => {
    t.ok(p, 'power should be on');
    t.end();
  });
});

tap.test('get brightness', (t) => {
  accessories[0].get('brightness', (error, p) => {
    t.strictEqual(p, 50, 'brightness should be 50');
    t.end();
  });
});

tap.test('set brightness', (t) => {
  accessories[0].set('brightness', 53, (error) => {
    t.ok(!error, 'Should not have an error');
    t.strictEqual(lastResult.query.level, '53', 'Should set brightness');
    t.strictEqual(lastResult.query.name, 'Test Device 1', 'Name should match');
    t.end();
  });
});

tap.test('shutdown http server', (t) => {
  server.close(() => t.end());
});
