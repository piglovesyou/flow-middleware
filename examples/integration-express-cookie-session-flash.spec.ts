/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/ban-ts-ignore, @typescript-eslint/no-non-null-assertion  */

import { promisify } from 'util';
import flow from '../src/flow';
import { ok, fail, strictEqual } from 'assert';
import { createServer, Server } from 'http';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import flash from 'express-flash';
import { CookieJar } from 'tough-cookie';
import fetch from 'node-fetch';
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
          strictEqual(
            req.session!.yeah,
            'yeah',
            'second request should use value that first request set in the session.',
          );
        } else {
          fail();
        }
        next();
      },
    );

    server = createServer(async (req, res) => {
      // Let's pass native req and res through Express middlewares
      const [reqProxy, resProxy] = await middlewares(req, res);

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
      ok(reqProxy.cookies);
      ok(reqProxy.session);
      ok(reqProxy.flash);
      ok(resProxy.cookie);
      ok(resProxy.redirect);

      res.end('Hello!');
    }).listen(port);

    const jar = new CookieJar();
    const url = `http://localhost:${port}`;
    const actual = await fetch(url).then(res => {
      const cookieStr = res.headers.get('set-cookie');
      strictEqual(typeof cookieStr, 'string');
      jar.setCookieSync(cookieStr!, url);
      return res.text();
    });
    strictEqual(actual, expect);

    await fetch(url + '/second', {
      headers: { cookie: jar.getCookiesSync(url).join('; ') },
    });
  });
});
