import express, {
  Handler,
  request as expressReqProto,
  response as expressResProto,
} from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { promisify } from 'util';
import { AnyMap, THandler } from './types';

// Since some guys behave in [pretty bad manner](https://github.com/jaredhanson/passport/blob/4ca43dac54f7ffbf97fba5c917463e7f19639d51/lib/framework/connect.js#L33-L38),
// we have to know what these properties are and proxy "this" arg on these functions.
const knownPropertiesExtendedInBadManner = [
  'login ',
  'logIn',
  'logout',
  'logOut ',
  'isAuthenticated ',
  'isUnauthenticated ',
].reduce(
  (acc, property) => ({ ...acc, [property]: true }),
  {} as Record<string, boolean>,
);

const expressApp = express();

function enforceThisArg(fn: any, thisArg: any) {
  return new Proxy(fn, {
    apply(target: any, _: any, argArray?: any): any {
      return Reflect.apply(fn, thisArg, argArray);
    },
  });
}

function enforceThisArgOnPropertyDescriptor(
  desc: PropertyDescriptor,
  thisArg: any,
) {
  const ext: Partial<PropertyDescriptor> = Object.create(null);

  if (desc.get) ext.get = enforceThisArg(desc.get, thisArg);
  if (desc.set) ext.set = enforceThisArg(desc.set, thisArg);
  if (desc.value && typeof desc.value === 'function')
    ext.value = enforceThisArg(desc.value, thisArg);

  return { ...desc, ...ext };
}

function wrapWithProxy(
  payload: any,
  nativeObj: IncomingMessage | ServerResponse,
  expressProto: typeof expressReqProto | typeof expressResProto,
) {
  // Wrap req and res
  const proxy = new Proxy<any>(payload, {
    get(_, property, proxyObj) {
      // Arbitrary properties such as "session"
      if (Reflect.has(payload, property)) {
        return Reflect.get(payload, property);

        // Access to the original http.IncomingMessage
      } else if (Reflect.has(nativeObj, property)) {
        const value = Reflect.get(nativeObj, property);

        if (
          Reflect.has(knownPropertiesExtendedInBadManner, property) &&
          typeof value === 'function'
        ) {
          return enforceThisArg(value, proxyObj);
        }

        if (typeof value === 'function')
          return enforceThisArg(value, nativeObj);
        return value;

        // Express proto should come to the last because it extends
        // IncomingMessage.
      } else if (Reflect.has(expressProto, property)) {
        const value = Reflect.get(expressProto, property, proxyObj);
        if (typeof value === 'function') return enforceThisArg(value, proxyObj);
        return value;
      }

      // Not found so it must be very "undefined"
      return undefined;
    },
    set(_, property, value) {
      // Node internal setter call
      if (Reflect.has(nativeObj, property))
        return Reflect.set(nativeObj, property, value);

      return Reflect.set(payload, property, value);
    },
    defineProperty(
      _,
      property: string | number | symbol,
      desc: PropertyDescriptor,
    ) {
      // Node core object never extends its properties.
      if (Reflect.has(nativeObj, property)) throw new Error('never');

      // This is the case that Express middlewares extend
      // Node object's property. If it's a function, we always enforce it
      // to be called with our proxied "this" object.
      const enforced = enforceThisArgOnPropertyDescriptor(desc, proxy);

      return Reflect.defineProperty(_, property, enforced);
    },
  });
  return proxy;
}

// https://github.com/expressjs/express/blob/c087a45b9cc3eb69c777e260ee880758b6e03a40/lib/middleware/init.js#L28-L42
function emulateExpressInit(proxiedReq: any, proxiedRes: any) {
  Reflect.set(proxiedReq, 'res', proxiedRes);
  Reflect.set(proxiedReq, 'app', expressApp);
  Reflect.set(proxiedRes, 'req', proxiedReq);
  Reflect.set(proxiedRes, 'app', expressApp);
  Reflect.set(proxiedRes, 'locals', proxiedRes.locals || Object.create(null));
}

export default function flow<TReqExt = AnyMap, TResExt = AnyMap>(
  ...middlewares: Handler[]
): THandler<TResExt, TResExt> {
  const promisifiedMiddlewares = middlewares.map((m) => promisify<any, any>(m));

  const handler: THandler<TResExt, TResExt> = async (req, res) => {
    const reqPayload: Partial<TReqExt> = Object.create(null);
    const resPayload: Partial<TResExt> = Object.create(null);

    const proxiedReq = wrapWithProxy(reqPayload, req, expressReqProto);
    const proxiedRes = wrapWithProxy(resPayload, res, expressResProto);

    emulateExpressInit(proxiedReq, proxiedRes);

    for (
      let i = 0, m = promisifiedMiddlewares[i];
      i < promisifiedMiddlewares.length;
      m = promisifiedMiddlewares[++i]
    ) {
      try {
        await m(proxiedReq, proxiedRes);
      } catch (e) {
        console.error(e);
        throw new Error(
          `[flow-middlewares] Error occurs in middleware index [${i}]: ${middlewares[i].name}`,
        );
      }
    }

    return [proxiedReq, proxiedRes];
  };

  return handler;
}
