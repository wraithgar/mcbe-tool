/**
 * Simple NBT Parser
 * @author clarkx86
 */

const log = require('./log')
const typeIds = {
  TAG_End: 0,
  TAG_Byte: 1,
  TAG_Short: 2,
  TAG_Int: 3,
  TAG_Long: 4,
  TAG_Float: 5,
  TAG_Double: 6,
  TAG_Byte_Array: 7,
  TAG_String: 8,
  TAG_List: 9,
  TAG_Compound: 10,
  TAG_Int_Array: 11,
  TAG_Long_Array: 12
}

function parse (data, callback) {
  const serialized = {}
  const refStack = []
  let offset = 0
  let valid = true

  while (valid) {
    const tagId = data.readInt8(offset)
    offset += 1
    let nameLength = 0
    let name = ''

    if (tagId !== typeIds.TAG_End) {
      nameLength = data.readInt16LE(offset)
      offset += 2
      name = data.slice(offset, offset + nameLength)
      offset += nameLength
    }

    let value

    switch (tagId) {
      case typeIds.TAG_End:
        refStack.pop()
        valid = refStack.length > 0
        break

      case typeIds.TAG_Byte:
        value = data.readInt8(offset)
        offset += 1
        break

      case typeIds.TAG_Short:
        value = data.readInt16LE(offset)
        offset += 2
        break

      case typeIds.TAG_Int:
        value = data.readInt32LE(offset)
        offset += 4
        break

      case typeIds.TAG_Long:
        break

      case typeIds.TAG_Float:
        break

      case typeIds.TAG_Double:
        break

      case typeIds.TAG_Byte_Array:
        break

      case typeIds.TAG_String: {
        const _length = data.readInt16LE(offset)
        offset += 2
        value = data.slice(offset, offset + _length).toString()
        offset += _length
      } break

      case typeIds.TAG_List:
        break

      case typeIds.TAG_Compound:
        if (refStack.length === 0) {
          serialized[name] = {}
          refStack.push(serialized[name])
        } else {
          refStack[refStack.length - 1][name] = {}
          refStack.push(refStack[refStack.length - 1][name])
        }
        break

      case typeIds.TAG_Int_Array:
        break

      case typeIds.TAG_Long_Array:
        break
    }

    // Serialize Tag
    if ((tagId !== typeIds.TAG_End) && (tagId !== typeIds.TAG_Compound)) {
      // log.debug(value)
      refStack[refStack.length - 1][name] = value
    }
  }

  serialized.bufferSize = offset
  return serialized
}

module.exports = { parse }
