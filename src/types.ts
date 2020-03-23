import {
  Handler,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { IncomingMessage, ServerResponse } from 'http';

export type THandler<ReqExt, ResExt> = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<
  [ExpressRequest & Partial<ReqExt>, ExpressResponse & Partial<ResExt>]
>;

export interface TCompose<ReqExt = {}, ResExt = {}> {
  <ReqExt, ResExt>(): THandler<ReqExt, ResExt>;
  <ReqExt, ResExt>(h1?: Handler): TCompose<ReqExt, ResExt>;
  <ReqExt, ResExt>(h1: Handler, h2: Handler): TCompose<ReqExt, ResExt>;
  <ReqExt, ResExt>(h1: Handler, h2: Handler, h3: Handler): TCompose<
    ReqExt,
    ResExt
  >;
  <ReqExt, ResExt>(
    h1: Handler,
    h2: Handler,
    h3: Handler,
    h4: Handler,
  ): TCompose<ReqExt, ResExt>;
  <ReqExt, ResExt>(
    h1: Handler,
    h2: Handler,
    h3: Handler,
    h4: Handler,
    h5: Handler,
  ): TCompose<ReqExt, ResExt>;
  <ReqExt, ResExt>(
    h1: Handler,
    h2: Handler,
    h3: Handler,
    h4: Handler,
    h5: Handler,
    h6: Handler,
  ): TCompose<ReqExt, ResExt>;
  <ReqExt, ResExt>(
    h1: Handler,
    h2: Handler,
    h3: Handler,
    h4: Handler,
    h5: Handler,
    h6: Handler,
    h7: Handler,
  ): TCompose<ReqExt, ResExt>;
}
