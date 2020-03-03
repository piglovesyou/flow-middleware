import flow from './flow';
import { TCompose } from './types';

// import {init as getExpressInitializer} from 'express/lib/middleware/init';
// const expressInit = getExpressInitializer(express());

const compose: TCompose = function<ReqExt = {}, ResExt = {}>(
  ...handlers: any
): any {
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
