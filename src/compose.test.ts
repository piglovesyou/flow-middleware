import assert from 'assert';
import { compose } from './index';

describe('compose', () => {
  test('calls handler from left to right', async () => {
    let actual = 0;

    const handler = compose(
      (req, res, next) => {
        assert.strictEqual(actual, 0);
        actual++;
        next();
      },
      (req, res, next) => {
        assert.strictEqual(actual, 1);
        actual++;
        next();
      },
      (req, res, next) => {
        assert.strictEqual(actual, 2);
        actual++;
        next();
      },
    )();
    await handler({} as any, {} as any);
    assert.strictEqual(actual, 3);
  });
});
