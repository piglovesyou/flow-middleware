# flow-middleware ![Node CI](https://github.com/piglovesyou/flow-middleware/workflows/Node%20CI/badge.svg) [![npm version](https://badge.fury.io/js/flow-middleware.svg)](https://badge.fury.io/js/flow-middleware)

Run Express middlewares on any Node.js server framework without hacking/polluting native `req`/`res` objects with Proxy.

[Checkout the Next.js example](https://github.com/piglovesyou/nextjs-passport-oauth-example) with [Passport.js](http://www.passportjs.org/) integration.

<details><summary><b>Why, How</b></summary>
<p>
    
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

</p>
</details>

![flow-middleware architecture](resource/flow-middleware.png)

# Getting started

Install it with Express.

```bash
yarn add flow-middleware express
```

### flow(...middlewares)

A function `flow` creates an http handler from some Express middlewares, processed from left to right of arguments.

```typescript
import flow from 'flow-middleware';
import { ok } from "assert";
import { createServer } from 'http';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import flash from 'express-flash';

// Creates an async function that handles req and res.
const handle = flow(
    cookieParser(),
    session({ secret: 'x' }),
    flash(),
    (reqProxy, _resProxy, next) => {
    
        // Our wrapped objects provide accessors
        // that Express middlewares extended💪
        ok(reqProxy.cookies);
        ok(reqProxy.session);
        ok(reqProxy.flash);
        next();
    }
);

createServer(async (req, res) => {
  
    // Let's run the Express middlewares🚀
    const [ reqProxy, resProxy ] = await handle(req, res);

    // Native objects are clean thanks to our proxy✨
    ok(req.cookies === undefined);
    ok(req.session === undefined);
    ok(req.flash === undefined);

    // You still can access to Express properties here🚚
    ok(reqProxy.cookies);
    ok(reqProxy.session);
    ok(reqProxy.flash);
    ok(resProxy.cookie);
    ok(resProxy.redirect);

    res.end('Hello!');
}).listen(3000);
```

### compose(...middlewares)(...middlewares)()

`compose` lets you hold a set of middlewares and share it on other routes. This is useful when you want the same initializing middlewares to come first while the different middlewares come at the end. **Calling it with zero arguments returns a handler function.** 

This is a Passport example where a login handler for `POST /api/auth/github` and an OAuth callback handler for `GET /api/auth/callback/github` share their initializing middlewares.

```typescript
import cookieSession from 'cookie-session';
import { compose } from 'flow-middleware';
import passport from './passport';

const composed = compose(
    cookieSession(),
    passport.initialize(),
    passport.session()
);

const handleToLogIn = composed(passport.authenticate('github'))();

const handleForCallback = composed(passport.authenticate('github', {
    failureRedirect: '/auth',
    successRedirect: '/',
}))();
```

Don't forget to call it with zero arguments at last to get a handler.

#### Wrapper function style

Or, you can simply write a wrapper function to share middlewares.

```typescript
import { Handler } from 'express';

function withPassport(...middlewares: Handler[]) {
    return flow(
        cookieSession(),
        passport.initialize(),
        passport.session(),
        ...middlewares
    );
}
```

# License

MIT

# Author

Soichi Takamura \<thepiglovesyou@gmail.com>
