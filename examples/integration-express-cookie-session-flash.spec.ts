/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/ban-ts-ignore */

import { promisify } from 'util';
import flow from '../src/flow';
import assert, { ok, deepStrictEqual } from 'assert';
import { createServer, get as httpGet, Server } from 'http';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import flash from 'express-flash';
import { Cookie, CookieJar } from 'tough-cookie';
import fetch from 'node-fetch';
import cookieSession from 'cookie-session';
import { getPortPromise } from 'portfinder';

describe('Integration', () => {
  let server: Server;

  afterEach(async () => {
    await promisify(server.close).call(server);
  });

  test('express-session, flash', async () => {
    const expect = 'Hello!';
    const port = await getPortPromise();

    // Creates a simple function that handles req and res.
    const middlewares = flow<Record<any, any>, Record<any, any>>(
      cookieParser(),
      session({ secret: 'x', resave: true, saveUninitialized: true }),
      flash(),
      (req, _res, next) => {
        // cookie-session's supposed to embed "session" property,
        // but it's clean since our proxy wipes them out✨
        ok(req.cookies);
        ok(req.session);
        ok(req.flash);

        if (req.url === '/') {
          req.session!.yeah = 'yeah';
        } else if (req.url === '/second') {
          assert.strictEqual(
            req.session!.yeah,
            'yeah',
            'second request should use value that first request set in the session.',
          );
        } else {
          assert.fail();
        }
        next();
      },
    );

    server = createServer(async (req, res) => {
      // Let's pass native req and res through Express middlewares
      const [proxiedReq, _proxiedRes] = await middlewares(req, res);

      // The native objects are still clean
      // since our proxy protects them from getting dirty✨

      // @ts-ignore
      ok(req.cookies === undefined);
      // @ts-ignore
      ok(req.session === undefined);
      // @ts-ignore
      ok(req.flash === undefined);

      // You can use properties that the middlewares
      // extend through proxied object, if you want🚚
      ok(proxiedReq.cookies);
      ok(proxiedReq.session);
      ok(proxiedReq.flash);

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

  // TODO: split test files
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
        // cookie-session's supposed to embed "session" property,
        // but it's clean since our proxy wipes them out✨
        // ok(req.cookies);
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
      const [reqExt, _resExt] = await middlewares(req, res);

      // @ts-ignore
      ok(req.session === undefined);

      ok(reqExt.session);

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