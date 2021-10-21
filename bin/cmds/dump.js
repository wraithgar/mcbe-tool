exports.command = 'dump'
exports.desc = 'exports chunk data'

const { LevelDB } = require('leveldb-zlib')

exports.builder = yargs => yargs
  .options({
    chunk: {
      description: 'specify chunk to render in the form of chunkX,chunkZ ',
      type: 'string',
      alias: 'c',
      demandOption: true,
    },
  })
  .coerce({
    chunk: function (c) {
      if (c) {
        const coords = c.split(',').map(Number)
        if (coords.length !== 2) {
          throw new Error('chunk must be in format chunkX,chunkZ')
        }
        if (isNaN(coords[0]) || isNaN(coords[1])) {
          throw new Error('chunk must be in format chunkX,chunkZ')
        }
        return { X: coords[0], Z: coords[1] }
      }
    }
  })

exports.handler = async function (argv) {
  const path = require('path')
  const log = require('../../lib/log')

  const dump = {}

  const db = new LevelDB(path.join(argv.level, 'db'))
  await db.open()
  const iter = db.getIterator({ keys: true, values: true })
  let entries
  entries = await iter.next()
  while (entries) {
    // [ key, value (empty), key, value (empty)]
    for (let i = 0; i < entries.length; i++) {
      if (i % 2) {
        const key = entries[i]
        if (!key.toString().match(/\W+/)) {
          continue
        }
        if (key.length === 9 || key.length === 10) {
          const X = key.readInt32LE(0)
          const Z = key.readInt32LE(4)
          if ((argv.chunk.X !== X) || (argv.chunk.Z !== Z)) {
            continue
          }
          log.debug(`pulling key for chunk ${X},${Z}`, key.toString('hex'))
          const data = await db.get(key)
          dump[key.toString('hex')] = data.toString('hex')
        }
      }
    }
    entries = await iter.next()
  }
  log.out(JSON.stringify(dump, null, ' '))
}
