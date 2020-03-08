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

function getProxyGetter<T extends object>(
  nativeObj: IncomingMessage | ServerResponse,
  disposor: Record<any, any>,
  expressProto: typeof expressReqProto | typeof expressResProto,
) {
  const proxyGetter: ProxyHandler<T>['get'] = (_, property, proxyObj) => {
    // let obj: any;
    // let thisContext: any;

    if (Reflect.has(disposor, property)) {
      // Arbitrary properties such as "session"
      return Reflect.get(disposor, property);
    } else if (Reflect.has(nativeObj, property)) {
      // Access to the original http.IncomingMessage

      const value = Reflect.get(nativeObj, property);
      // TODO: Better patch for Passport
      if (property === 'login' || property === 'logIn') {
        return value.bind(proxyObj);
      }

      if (typeof value === 'function') return enforceThisArg(value, nativeObj); // return value.bind(nativeObj);
      return value;
    } else if (Reflect.has(expressProto, property)) {
      // Express proto should come to the last because it extends IncomingMessage.
      // Access to express API.
      const value = Reflect.get(expressProto, property, proxyObj);
      if (typeof value === 'function') return value.bind(proxyObj);
      return value;
    }

    // Not found so returning undefined
    return undefined;
  };
  return proxyGetter;
}

function getProxySetter<T extends object>(
  nativeObj: IncomingMessage | ServerResponse,
  disposor: Record<any, any>,
  // expressProto: typeof expressReqProto | typeof expressResProto,
) {
  const proxySetter: ProxyHandler<T>['set'] = (_, property, value) => {
    // "_header" etc.
    if (Reflect.has(nativeObj, property)) {
      return Reflect.set(nativeObj, property, value);
    }

    return Reflect.set(disposor, property, value);
  };
  return proxySetter;
}

function getProxyDefineProeprpty<T extends object>(
  nativeObj: IncomingMessage | ServerResponse,
  disposor: Record<any, any>,
  // expressProto: typeof expressReqProto | typeof expressResProto,
) {
  const proxyFn: ProxyHandler<T>['defineProperty'] = (
    _,
    property: string | number | symbol,
    attributes: PropertyDescriptor,
  ) => {
    if (Reflect.has(nativeObj, property)) {
      throw new Error('what?');
    }

    if (attributes.get)
      attributes.get = enforceThisArg(attributes.get, nativeObj);
    if (attributes.set)
      attributes.set = enforceThisArg(attributes.set, nativeObj);
    if (attributes.value && typeof attributes.value === 'function')
      attributes.value = enforceThisArg(attributes.value, nativeObj);

    return Reflect.defineProperty(_, property, attributes);
  };
  return proxyFn;
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
    get: getProxyGetter(nativeObj, disposor, expressProto),
    set: getProxySetter(nativeObj, disposor),
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

    // Wrap req and res
    const wrappedReq = wrapWithProxy(req, reqDisposor, expressReqProto);
    // const wrappedReq = new Proxy<any>(reqDisposor, {
    //   get: getProxyGetter(req, reqDisposor, expressReqProto),
    //   set: getProxySetter(req, reqDisposor),
    //   defineProperty(
    //     _,
    //     property: string | number | symbol,
    //     desc: PropertyDescriptor,
    //   ) {
    //     // Node core object never extends its properties.
    //     if (Reflect.has(req, property)) throw new Error('never');
    //
    //     // This is the case that Express middlewares extend
    //     // Node object's property. If it's a function, we always enforce it
    //     // to be called with our proxied "this" object.
    //     const enforced = enforceThisArgOnPropertyDescriptor(desc, wrappedReq);
    //
    //     return Reflect.defineProperty(_, property, enforced);
    //   },
    // });

    const wrappedRes = new Proxy<any>(resDisposor, {
      get: getProxyGetter(res, resDisposor, expressResProto),
      set: getProxySetter(res, resDisposor),
      // defineProperty: getProxyDefineProeprpty(res, reqDisposor),
      defineProperty(
        _,
        property: string | number | symbol,
        desc: PropertyDescriptor,
      ) {
        // Node core object never extends its properties.
        if (Reflect.has(res, property)) throw new Error('never');

        // This is the case that Express middlewares extend
        // Node object's property. If it's a function, we always enforce it
        // to be called with our proxied "this" object.
        const enforced = enforceThisArgOnPropertyDescriptor(desc, wrappedRes);

        return Reflect.defineProperty(_, property, enforced);
      },
    });

    // @ts-ignore
    global.req = req;
    // @ts-ignore
    global.res = res;
    // @ts-ignore
    global.reqDisposor = reqDisposor;
    // @ts-ignore
    global.resDisposor = resDisposor;

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
