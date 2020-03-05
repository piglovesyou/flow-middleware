/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/ban-ts-ignore */

import flow from '../src/flow';
import assert, { ok, deepStrictEqual } from 'assert';
import { createServer, get as httpGet } from 'http';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import flash from 'express-flash';

test('integration', async () => {
  const expect = 'Hello!';
  let actual = '';

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
      next();
    },
  );

  createServer(async (req, res) => {
    // Let's pass native req and res through Express middlewares
    const [reqExt, _resExt] = await middlewares(req, res);

    // The native objects are still clean
    // since our proxy protects them from getting dirty✨

    // @ts-ignore
    ok(req.cookies === undefined);
    // @ts-ignore
    ok(req.session === undefined);
    // @ts-ignore
    ok(req.flash === undefined);

    // You can use properties that
    // the middlewares extend, if you want🚚
    deepStrictEqual(reqExt.cookies, { a: 'a' });
    ok(reqExt.session);
    ok(reqExt.flash);

    res.end('Hello!');
  }).listen(3030);

  await new Promise((resolve, reject) => {
    httpGet('http://localhost:3030', { headers: { cookie: 'a=a' } }, res => {
      res.on('data', (data: any) => (actual += String(data)));
      res.on('end', resolve);
      res.on('error', reject);
    });
  });

  assert.strictEqual(actual, expect);
});
