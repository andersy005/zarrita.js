// @ts-check
import { BoolArray, ByteStringArray, UnicodeStringArray } from './custom-arrays.js';

const encoder = new TextEncoder();
/** @param {Record<string, any>} o */
export function json_encode_object(o) {
  const str = JSON.stringify(o, null, 2);
  return encoder.encode(str);
}

const decoder = new TextDecoder();
/** @param {Uint8Array} bytes */
export function json_decode_object(bytes) {
  const str = decoder.decode(bytes);
  return JSON.parse(str);
}

function system_is_little_endian() {
  const a = new Uint32Array([0x12345678]);
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  return !(b[0] === 0x12);
}

const LITTLE_ENDIAN_OS = system_is_little_endian();

/**
 * @param {import('../types').DataType} dtype
 */
export const should_byte_swap = (dtype) => LITTLE_ENDIAN_OS && dtype[0] === '>';

/** @param {import('../types').TypedArray<import('../types').DataType>} src */
export function byte_swap_inplace(/** @type {any} */ src) {
  if (!('BYTES_PER_ELEMENT' in src)) return;
  const b = src.BYTES_PER_ELEMENT;
  const flipper = new Uint8Array(src.buffer, src.byteOffset, src.length * b);
  const numFlips = b / 2;
  const endByteIndex = b - 1;
  let t = 0;
  for (let i = 0; i < flipper.length; i += b) {
    for (let j = 0; j < numFlips; j += 1) {
      t = flipper[i + j];
      flipper[i + j] = flipper[i + endByteIndex - j];
      flipper[i + endByteIndex - j] = t;
    }
  }
}

/**
 * @template T
 * @param {T | T[]} maybe_arr
 * @return {T[]}
 */
export function ensure_array(maybe_arr) {
  return Array.isArray(maybe_arr) ? maybe_arr : [maybe_arr];
}

/**
 * @template {string} D
 *
 * @param {D} dtype
 * @returns {D extends import('../types').DataType ? D : never}
 */
export function ensure_dtype(dtype) {
  // TODO: validation
  return /** @type {any} */ (dtype);
}

/** @param {string} path */
export function normalize_path(path) {
  return path[0] !== '/' ? `/${path}` : path;
}

const constructors = {
  u1: Uint8Array,
  i1: Int8Array,
  u2: Uint16Array,
  i2: Int16Array,
  u4: Uint32Array,
  i4: Int32Array,
  i8: globalThis.BigInt64Array,
  u8: globalThis.BigUint64Array,
  f4: Float32Array,
  f8: Float64Array,
  b1: BoolArray,
  U: UnicodeStringArray,
  S: ByteStringArray,
};

/**
 * @template {import('../types').DataType} Dtype
 * @param {Dtype} dtype
 * @returns {import('../types').TypedArrayConstructor<Dtype>}
 */
export function get_ctr(dtype) {
  // Dynamically create stirng-array class
  if (dtype[1] === 'U' || dtype[1] === 'S') {
    const key = /** @type {'U' | 'S'} */ (dtype[1]);
    const size = parseInt(dtype.slice(2));
    const ctr = class extends constructors[key] {
      constructor(/** @type {number|ArrayBuffer} */ x) {
        super(x, size);
      }
    };
    return /** @type {import('../types').TypedArrayConstructor<Dtype>} */ (ctr);
  }

  // get last two characters of three character DataType; can only be keyof DTYPES at the moment.
  const key = /** @type {Exclude<keyof constructors, 'U' | 'S'>} */ (dtype.slice(1));
  const ctr = constructors[key];

  if (!ctr) {
    throw new Error(`dtype not supported either in zarrita or in browser! got ${dtype}.`);
  }

  return /** @type {any} */ (ctr);
}

/**
 * python-like range generator
 * @param {number} start
 * @param {number=} stop
 * @param {number=} step
 */
export function* range(start, stop, step = 1) {
  if (stop == undefined) {
    stop = start;
    start = 0;
  }
  for (let i = start; i < stop; i += step) {
    yield i;
  }
}

/**
 * python-like itertools.product generator
 * https://gist.github.com/cybercase/db7dde901d7070c98c48
 *
 * @template {Array<Iterable<any>>} T
 * @param {T} iterables
 * @returns {IterableIterator<{ [K in keyof T]: T[K] extends Iterable<infer U> ? U : never}>}
 */
export function* product(...iterables) {
  if (iterables.length === 0) {
    return;
  }
  // make a list of iterators from the iterables
  const iterators = iterables.map((it) => it[Symbol.iterator]());
  const results = iterators.map((it) => it.next());
  if (results.some((r) => r.done)) {
    throw new Error('Input contains an empty iterator.');
  }
  for (let i = 0;;) {
    if (results[i].done) {
      // reset the current iterator
      iterators[i] = iterables[i][Symbol.iterator]();
      results[i] = iterators[i].next();
      // advance, and exit if we've reached the end
      if (++i >= iterators.length) {
        return;
      }
    } else {
      yield /** @type {any} */ (results.map(({ value }) => value));
      i = 0;
    }
    results[i] = iterators[i].next();
  }
}

/**
 * @param {number | null} start
 * @param {(number | null)=} stop
 * @param {(number | null)=} step
 * @return {import('../types').Slice}
 */
export function slice(start, stop, step = null) {
  if (stop === undefined) {
    stop = start;
    start = null;
  }
  /** @type {(length: number) => import('../types').Indices} */
  const indices = (length) => {
    const istep = step ?? 1;
    let start_ix = start ?? (istep < 0 ? length - 1 : 0);
    let end_ix = stop ?? (istep < 0 ? -1 : length);
    if (start_ix < 0) start_ix += length;
    if (end_ix < 0) end_ix += length;
    return [start_ix, end_ix, istep];
  };
  return { start, stop, step, indices, kind: 'slice' };
}

/**
 * Built-in "queue" for awaiting promises.
 * @returns {import('../types').ChunkQueue}
 */
export function create_queue() {
  /** @type {Promise<void>[]} */
  const promises = [];
  return {
    add: (fn) => promises.push(fn()),
    onIdle: () => Promise.all(promises),
  };
}
