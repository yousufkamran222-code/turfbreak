import { describe, expect, it } from 'vitest';
import { defaultSave, parseSave, serializeSave } from '../src/meta/save';

describe('save', () => {
  it('round-trips', () => {
    const s = { ...defaultSave(), launches: 5 };
    expect(parseSave(serializeSave(s))).toEqual(s);
  });

  it.each([null, '', '{', 'null', '42', '"x"', '{"version":1}', '{"version":99,"launches":3}', '{"version":1,"launches":"3"}'])(
    'falls back to a fresh save for %s',
    (raw) => {
      expect(parseSave(raw)).toEqual(defaultSave());
    },
  );
});
