import express, {
  Handler,
  request as expressReqProto,
  response as expressResProto,
} from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { promisify } from 'util';
import { THandler } from './types';

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
  const ext: Partial<PropertyDescriptor> = {};

  if (desc.get) ext.get = enforceThisArg(desc.get, thisArg);
  if (desc.set) ext.set = enforceThisArg(desc.set, thisArg);
  if (desc.value && typeof desc.value === 'function')
    ext.value = enforceThisArg(desc.value, thisArg);

  return { ...desc, ...ext };
}

function wrapWithProxy(
  nativeObj: IncomingMessage | ServerResponse,
  disposor: any,
  expressProto: typeof expressReqProto | typeof expressResProto,
) {
  // Wrap req and res
  const proxy = new Proxy<any>(disposor, {
    get(_, property, proxyObj) {
      // Arbitrary properties such as "session"
      if (Reflect.has(disposor, property)) {
        return Reflect.get(disposor, property);

        // Access to the original http.IncomingMessage
      } else if (Reflect.has(nativeObj, property)) {
        const value = Reflect.get(nativeObj, property);
        // TODO: Better patch for Passport
        if (property === 'login' || property === 'logIn') {
          return value.bind(proxyObj);
        }

        if (typeof value === 'function')
          return enforceThisArg(value, nativeObj);
        return value;

        // Express proto should come to the last because it extends
        // IncomingMessage.
      } else if (Reflect.has(expressProto, property)) {
        const value = Reflect.get(expressProto, property, proxyObj);
        if (typeof value === 'function') return value.bind(proxyObj);
        return value;
      }

      // Not found so it must be very "undefined"
      return undefined;
    },
    set(_, property, value) {
      // Node internal setter call
      if (Reflect.has(nativeObj, property))
        return Reflect.set(nativeObj, property, value);

      return Reflect.set(disposor, property, value);
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

export default function flow<TReqExt = {}, TResExt = {}>(
  ...middlewares: Handler[]
) {
  const promisifiedMiddlewares = middlewares.map(m => promisify<any, any>(m));

  const handler: THandler<TReqExt, TResExt> = async (req, res) => {
    const reqDisposor = {} as TReqExt;
    const resDisposor = {} as TResExt;

    const wrappedReq = wrapWithProxy(req, reqDisposor, expressReqProto);
    const wrappedRes = wrapWithProxy(res, resDisposor, expressResProto);

    // @ts-ignore
    Reflect.set(reqDisposor, 'res', wrappedRes);
    // @ts-ignore
    Reflect.set(reqDisposor, 'app', expressApp);
    // @ts-ignore
    Reflect.set(resDisposor, 'req', wrappedReq);
    // @ts-ignore
    Reflect.set(resDisposor, 'app', expressApp);

    // TODO: This goes wrong. Why?
    // expressInit(wrappedReq, wrappedRes, () => { throw new Error('Wait, who calls me?')});

    for (
      let i = 0, m = promisifiedMiddlewares[i];
      i < promisifiedMiddlewares.length;
      m = promisifiedMiddlewares[++i]
    ) {
      try {
        await m(wrappedReq, wrappedRes);
      } catch (e) {
        console.error(e);
        throw new Error(
          `[flow-middlewares] Error occurs in middleware ${i + 1}: ${
            middlewares[i].name
          }`,
        );
      }
    }

    return [reqDisposor, resDisposor];
  };

  return handler;
}
