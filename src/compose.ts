import flow from './flow';
import { AnyMap, TCompose } from './types';

// import {init as getExpressInitializer} from 'express/lib/middleware/init';
// const expressInit = getExpressInitializer(express());

const compose: TCompose = function <ReqExt = AnyMap, ResExt = AnyMap>(
  ...handlers: any
) {
  if (!handlers.length) throw new Error('boom');

  // XXX: Better typing...?
  return (...args: any[]): any => {
    if (args.length) {
      return compose(...handlers, ...args);
    }

    return flow(...handlers);
  };
};

export default compose;
