import assert from 'assert';
import { createServer, get as httpGet, Server } from 'http';
import flow from './index';
import { promisify } from 'util';

describe('flow', () => {
  let server: Server;
  afterEach(async () => {
    await promisify(server.close).call(server);
  });
  test('ends ServerResponse properly', async () => {
    const expect = 'yeah';
    let actual = '';

    const handler = flow((req, res, next) => {
      res.end('yeah');
      next();
    });
    server = createServer(handler).listen(3030);
    await new Promise((resolve, reject) => {
      httpGet('http://localhost:3030', res => {
        res.on('data', (data: any) => (actual += String(data)));
        res.on('end', resolve);
        res.on('error', reject);
      });
    });
    assert.strictEqual(actual, expect);
  });
});
