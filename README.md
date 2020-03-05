# flow-middleware

Run Express middlewares on anywhere

# Why

As people start using a new Node server library other than [Express](https://expressjs.com/), they encounter a lack of middlewares that Express already has, which have been well tested and production-ready many years ago. Some of them try to shape a brand new ecosystem on the new island and some just go back to Express.

Let's start from admitting Express is one of the most successful, beautifully designed and battle-tested software in the Node ecosystem. Don't forget its **hundreds of outstanding middlewares** have been born on it. Then why you can't use them? The answers will be summarized:

* It breaks since they depend on `req.param()` and `res.redirect()` that Express decorates native objects with. I don't want to hack to make them work in my _${Your favorite server comes here}_.
* Pollution. [Express officially recommends](https://expressjs.com/en/guide/writing-middleware.html) middlewares to extend object properties such as `req.session` and `req.flash`, just where my _${Your favorite server}_ leaves them tidy. Plus, dynamic extensions don't fit today of the TypeScript era.

Yeah. Let's move on.

# How

JavaScript `Proxy`.

Wrapping `req` and `res` by `Proxy` to split using native methods and Express methods. Express exports clean prototypes that we can intercept internal calls with. It lets middlewares to call native methods like `res.writeHead()` and `res.end()` so native objects properly embed HTTP info and send the response.

In the end, flow-middleware returns the extended properties like `req.session` and `req.user` so you can use them after the middlewares go through.

# Getting started

To install, run this.

```bash
yarn add flow-middleware express
```

### `flow(...middlewares)`

A function `flow` creates an http handler from Express middlewares, processed from left to right arguments.

```typescript
import flow from 'flow-middleware';
import { ok } from "assert";
import { createServer } from 'http';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import flash from 'express-flash';

// Creates a simple function that handles req and res.
const middlewares = flow(
    cookieParser(),
    session({ secret: 'x' }),
    flash(),
    (req, _res, next) => {
      // cookie-session's supposed to embed "session" property,
      // but it's clean since our proxy wipes them out✨
      ok(req.cookies);
      ok(req.session);
      ok(req.flash);
      next();
    }
);

createServer(async (req, res) => {
  
  // Let's pass native req and res through Express middlewares
  const [ reqExt, _resExt ] = await middlewares(req, res);

  // The native objects are still clean
  // since our proxy protects them from getting dirty✨
  ok(req.cookies === undefined);
  ok(req.session === undefined);
  ok(req.flash === undefined);

  // You can use properties that
  // the middlewares extend, if you want🚚
  ok(reqExt.cookies);
  ok(reqExt.session);
  ok(reqExt.flash);

  res.end('Hello!');
}).listen(3000);
```

### `compose(...middlewares)(...middlewares)()`

Another function `compose` lets you hold a set of middlewares and share it on other routes. **Calling it with no argument returns a handler function.**

This is the passport configure example where a login route and an OAuth callback route share initializing middlewares.

First compose initializing middlewares,

```typescript
import cookieSession from 'cookie-session';
import { compose } from 'flow-middleware';
import passport from './passport';

const composedMiddlewares = compose(
    cookieSession(),
    passport.initialize(),
    passport.session()
);
export default composedMiddlewares
```

Then multiple routes can share it like this. Don't forget to call with zero arguments to get a handler at last.

In `POST /api/auth/github` for an example,

```typescript
export default composedMiddlewares(passport.authenticate('github'))();
```

Another `GET /api/auth/callback/github` would look like this.

```typescript
export default composedMiddlewares(
    passport.authenticate('github', {
      failureRedirect: '/auth',
      successRedirect: '/',
    })
)();
```

# LICENSE

MIT

# Author

Soichi Takamura \<thepiglovesyou@gmail.com>
