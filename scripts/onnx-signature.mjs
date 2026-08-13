/**
 * Reads the input signature straight out of an ONNX file.
 *
 * Just enough protobuf to walk ModelProto -> GraphProto -> input -> shape. The
 * point is that a model declares its own window size, so renaming a file or
 * swapping architecture (lstm -> gru) cannot desynchronise the app from the
 * models it ships. Pulling in a full ONNX parser for four fields would be worse.
 */

const WIRE_VARINT = 0;
const WIRE_64BIT = 1;
const WIRE_LENGTH = 2;
const WIRE_32BIT = 5;

function readVarint(buffer, offset) {
  let result = 0;
  let shift = 0;
  while (offset < buffer.length) {
    const byte = buffer[offset++];
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [result, offset];
    shift += 7;
  }
  throw new Error('truncated varint');
}

/** Yields [fieldNumber, wireType, value] for one protobuf message. */
function* fields(buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    let key;
    [key, offset] = readVarint(buffer, offset);
    const fieldNumber = key >>> 3;
    const wireType = key & 7;
    let value;
    switch (wireType) {
      case WIRE_VARINT:
        [value, offset] = readVarint(buffer, offset);
        break;
      case WIRE_LENGTH: {
        let length;
        [length, offset] = readVarint(buffer, offset);
        value = buffer.subarray(offset, offset + length);
        offset += length;
        break;
      }
      case WIRE_64BIT:
        value = buffer.subarray(offset, offset + 8);
        offset += 8;
        break;
      case WIRE_32BIT:
        value = buffer.subarray(offset, offset + 4);
        offset += 4;
        break;
      default:
        return;
    }
    yield [fieldNumber, wireType, value];
  }
}

function first(buffer, wanted) {
  for (const [fieldNumber, , value] of fields(buffer)) {
    if (fieldNumber === wanted) return value;
  }
  return null;
}

/** TensorShapeProto -> array of numbers, with null for symbolic dimensions. */
function readShape(tensorType) {
  const shapeProto = first(tensorType, 2);
  if (!shapeProto) return [];
  const dims = [];
  for (const [fieldNumber, , dimension] of fields(shapeProto)) {
    if (fieldNumber !== 1) continue;
    let value = null;
    for (const [dimField, , dimValue] of fields(dimension)) {
      if (dimField === 1) value = dimValue; // dim_value
    }
    dims.push(value); // null = dim_param, i.e. a symbolic batch axis
  }
  return dims;
}

/**
 * Returns { name, shape } for the graph's first input, or null if the file does
 * not look like an ONNX model.
 */
export function readInputSignature(buffer) {
  const graph = first(buffer, 7); // ModelProto.graph
  if (!graph) return null;
  const input = first(graph, 11); // GraphProto.input
  if (!input) return null;

  let name = null;
  let shape = [];
  for (const [fieldNumber, , value] of fields(input)) {
    if (fieldNumber === 1) name = Buffer.from(value).toString('utf8');
    else if (fieldNumber === 2) {
      const tensorType = first(value, 1); // TypeProto.tensor_type
      if (tensorType) shape = readShape(tensorType);
    }
  }
  return name === null ? null : { name, shape };
}
