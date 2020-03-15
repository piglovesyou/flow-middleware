/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/ban-ts-ignore, @typescript-eslint/no-non-null-assertion */

import { promisify } from 'util';
import flow from '../src/flow';
import assert, { ok } from 'assert';
import { createServer, Server } from 'http';
import { CookieJar } from 'tough-cookie';
import fetch from 'node-fetch';
import cookieSession from 'cookie-session';
import { getPortPromise } from 'portfinder';

describe('Integration', () => {
  let server: Server;

  afterEach(async () => {
    await promisify(server.close).call(server);
  });

  test('cookie-session', async () => {
    const port = await getPortPromise();
    const expect = 'Hello!';

    // Creates a simple function that handles req and res.
    const middlewares = flow<Record<any, any>, Record<any, any>>(
      cookieSession({
        name: 'passportSession',
        signed: false,
      }),
      (req, _res, next) => {
        ok(req.session);

        if (req.url === '/') {
          req.session!.yeah = 'yeah';
        } else if (req.url === '/second') {
          assert.strictEqual(req.session!.yeah, 'yeah');
        } else {
          assert.fail();
        }
        next();
      },
    );

    server = createServer(async (req, res) => {
      // Let's pass native req and res through Express middlewares
      const [proxiedReq, _proxiedRes] = await middlewares(req, res);

      // @ts-ignore
      ok(req.session === undefined);

      ok(proxiedReq.session);

      res.end('Hello!');
    }).listen(port);

    const jar = new CookieJar();
    const url = `http://localhost:${port}`;
    const actual = await fetch(url).then(res => {
      const cookieStr = res.headers.get('set-cookie');
      assert.strictEqual(typeof cookieStr, 'string');
      jar.setCookieSync(cookieStr!, url);
      return res.text();
    });
    assert.strictEqual(actual, expect);

    await fetch(url + '/second', {
      headers: { cookie: jar.getCookiesSync(url).join('; ') },
    });
  });
});
