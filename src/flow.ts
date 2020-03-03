import {
  Handler,
  request as expressReqProto,
  response as expressResProto,
} from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { promisify } from 'util';
import { THandler } from './types';

function getProxyGetter<T extends object>(
  disposor: Record<any, any>,
  expressProto: typeof expressReqProto | typeof expressResProto,
) {
  const proxyGetter: ProxyHandler<T>['get'] = (target, property, receiver) => {
    let obj: any;
    let thisContext: any;

    if (Reflect.has(disposor, property)) {
      // Arbitrary properties such as "session"
      obj = disposor;
      thisContext = receiver;
    } else if (Reflect.has(target, property)) {
      // Access to the original http.IncomingMessage
      obj = target;
      thisContext = target;
    } else if (Reflect.has(expressProto, property)) {
      // Access to express API.
      obj = expressProto;
      thisContext = receiver;
    } else {
      // Not found so returning undefined
      return undefined;
    }

    const value = Reflect.get(obj, property, receiver);

    // Some functions internally expects original object, so we bind it.
    if (typeof value === 'function') return value.bind(thisContext);

    return value;
  };
  return proxyGetter;
}

function getProxySetter<T extends object>(disposor: Record<any, any>) {
  const proxySetter: ProxyHandler<T>['set'] = (target, property, value) => {
    // "_header" etc.
    if (Reflect.has(target, property)) {
      return Reflect.set(target, property, value);
    }

    return Reflect.set(disposor, property, value);
  };
  return proxySetter;
}

export default function flow<TReqExt = {}, TResExt = {}>(
  ...middlewares: Handler[]
) {
  const promisifiedMiddlewares = middlewares.map(m => promisify<any, any>(m));

  const handler: THandler<TReqExt, TResExt> = async (req, res) => {
    const reqDisposor = {} as TReqExt;
    const resDisposor = {} as TResExt;

    // Wrap req and res
    const wrappedReq = new Proxy<IncomingMessage>(req, {
      get: getProxyGetter(reqDisposor, expressReqProto),
      set: getProxySetter(reqDisposor),
    });
    const wrappedRes = new Proxy<ServerResponse>(res, {
      get: getProxyGetter(resDisposor, expressResProto),
      set: getProxySetter(resDisposor),
    });

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
          `[flow-middlewares] Error occurs in middleware ${i + 1}: ${String(
            middlewares[i],
          )}`,
        );
      }
    }

    return [reqDisposor, resDisposor];
  };

  return handler;
}
