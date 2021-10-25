exports.command = 'dump'
exports.desc = 'exports level data'

/* $lab:coverage:off$ */
exports.builder = yargs => yargs
  .options({
    chunk: {
      description: 'specify chunk to render in the form of chunkX,chunkZ ',
      type: 'string',
      alias: 'c'
    },
    type: {
      description: 'type of dump',
      choices: ['chunk', 'level'],
      alias: 't',
      default: 'level'
    }
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
  .check(function (argv) {
    if (argv.type === 'chunk' && !argv.chunk) {
      throw new Error('please provide a chunk')
    }
    return true
  })
/* $lab:coverage:on$ */

exports.handler = async function (argv) {
  const promisify = require('@gar/promisify')
  const fs = promisify(require('fs'))
  const log = require('../../lib/log')
  const path = require('path')
  const { LevelDB } = require('leveldb-zlib')
  const nbt = require('prismarine-nbt')

  let dump
  if (argv.type === 'chunk') {
    dump = {}
    const db = new LevelDB(path.join(argv.level, 'db'))
    await db.open()
    const iter = db.getIterator({ values: false })
    let entry
    for (let i = 0; entry = await iter.next(); i++) {
      const key = entry[1]
      if (['BiomeData', 'Overworld', 'mobevents', 'scoreboard'].includes(key.toString())) {
        // Why would they do this?
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
  } else {
    const dat = await fs.readFile(path.join(argv.level, 'level.dat'))
    const { parsed } = await nbt.parse(dat)
    dump = parsed
  }
  log.out(JSON.stringify(dump, null, ' '))
}
