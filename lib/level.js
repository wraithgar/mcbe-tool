'use strict'

const promisify = require('@gar/promisify')

const fs = promisify(require('fs'))
const path = require('path')

const { LevelDB } = require('leveldb-zlib')

// TODO find one nbt parser for this and subchunks
const { parse: nbtParse } = require('prismarine-nbt')

const Chunk = require('./chunk.js')
const log = require('./log')

const _chunks = Symbol('chunks')
const _bounds = Symbol('bounds')
const _db = Symbol('db')
const _dat = Symbol('dat')
const _name = Symbol('name')
const _nbt = Symbol('nbt')
const _openPromise = Symbol('openPromise')
const _subChunkCount = Symbol('subChunkCount')
const _zoomLevelMax = Symbol('zoomLevelMax')

/*
  * https://minecraft.fandom.com/wiki/Bedrock_Edition_level_format#Mojang_variant_LevelDB_format
  *
  * Overworld key
  * 0123456789
  *
  * 0123 = signed little-endian integer, x chunk coordinate
  * 4567 = signed little-endian integer, z chunk coordinate
  * 8 = one-byte tag recordType
  * 9 = one-byte subchunk index (if recordType 47)
  *
  * Nether/End key
  * 0123456789abcd
  *
  * 0123 = signed little-endian integer, x chunk coordinate
  * 4567 = signed little-endian integer, z chunk coordinate
  * 89ab = signed little-endian integer, 1 = nether, 2 = end
  * c = one-byte tag recordType
  * d = one-byte subchunk index (if recordType 47)
  *
  * length 9 = not a subchunk, overworld
  * length 10 = subchunk, overworld
  * length 13 = not a subchunk, nether/end
  * length 14 = subchunk, nether/end
  *
  * https://github.com/mmccoo/minecraft_mmccoo/blob/master/parse_bedrock.cpp
  */

module.exports = class Level {
  constructor (levelPath) {
    this[_name] = fs.readFile(path.join(levelPath, 'levelname.txt'))
    this[_db] = new LevelDB(path.join(levelPath, 'db'))
    this[_nbt] = fs.readFile(path.join(levelPath, 'level.dat'))
    this[_openPromise] = this[_db].open()
    // Chunk metadata, mostly pointers
    this[_chunks] = {}
    this[_subChunkCount] = 0
    this[_bounds] = { min: { X: 0, Z: 0 }, max: { X: 0, Z: 0 } }
  }

  get name () {
    return this[_name]
  }

  get dat () {
    return this[_dat]
  }

  get chunkCount () {
    return Object.keys(this[_chunks]).length
  }

  get subChunkCount () {
    return this[_subChunkCount]
  }

  // TODO protect, make chunks its own type of object?
  get chunks () {
    return this[_chunks]
  }

  get bounds () {
    return {
      max: { ...this[_bounds].max },
      min: { ...this[_bounds].min }
    }
  }

  get zoomLevelMax () {
    return this[_zoomLevelMax]
  }

  async parse () {
    const { parsed } = await nbtParse(await this[_nbt])
    this[_dat] = parsed.value
  }

  dbGet (key) {
    return this[_db].get(key)
  }

  async findChunks (opts) {
    opts = { keyTypes: [47], ...opts }

    await this[_openPromise]

    const iter = this[_db].getIterator({ values: false })
    let entry
    for (let i = 0; entry = await iter.next(); i++) {
      const key = entry[1]
      if (['BiomeData', 'Overworld', 'mobevents', 'scoreboard'].includes(key.toString())) {
        // Why would they do this?
        continue
      }
      // Filter out the special keys, and nether/end for now
      if (key.length === 9 || key.length === 10) {
        const coords = key.slice(0, 8).toString('hex')
        const keyType = key.readInt8(8)
        const X = key.readInt32LE(0)
        const Z = key.readInt32LE(4)
        if (opts.chunk && ((opts.chunk.X !== X) || (opts.chunk.Z !== Z))) {
          continue
        }
        if (opts.keyTypes && !opts.keyTypes.includes(keyType)) {
          continue
        }
        if (!this[_chunks][coords]) {
          this[_chunks][coords] = {
            X,
            Z,
            subChunkKeys: [],
            subChunkValues: []
          }
        }
        const chunk = this[_chunks][coords]
        this[_bounds].min.X = Math.min(chunk.X, this[_bounds].min.X)
        this[_bounds].min.Z = Math.min(chunk.Z, this[_bounds].min.Z)
        this[_bounds].max.X = Math.max(chunk.X, this[_bounds].max.X)
        this[_bounds].max.Z = Math.max(chunk.Z, this[_bounds].max.Z)

        this[_zoomLevelMax] = Math.round(Math.log2(this[_bounds].max.X - this[_bounds].min.X))
        if ((this[_bounds].max.X - this[_bounds].min.X) < (this[_bounds].max.Z - this[_bounds].min.Z)) {
          this[_zoomLevelMax]++
        }
        if (key.length === 9) {
          if (keyType === 44 || keyType === 118) {
            // chunkVersion
            const version = await this.dbGet(key)
            chunk.version = version.readInt8(0)
          } else if (keyType === 45) {
            // Biomes and Elevations
            chunk.Data2D = key
          } else if (keyType === 46) {
            // data2d legacy
          } else if (keyType === 49) {
            // blockEntity
          } else if (keyType === 50) {
            // entity
          } else if (keyType === 51) {
            // pending ticks
          } else if (keyType === 53) {
            // biome state
          } else if (keyType === 54) {
            // finalized state
            const state = await this.dbGet(key)
            chunk.finalizedState = state.readInt32LE(0)
          } else if (keyType === 58) {
            // random ticks
          } else if (keyType === 59) {
            // xxHash checksums of other chunk records
          }
        } else if (key.length === 10) {
          if (keyType === 47) {
            // subChunkPrefix
            const subChunkIndex = key.readInt8(9)
            chunk.subChunkKeys[subChunkIndex] = key
            this[_subChunkCount]++
          }
        }
      } else if (key.length === 13 || key.length === 14) {
        // const chunk = {
        //   type: key.readInt32LE(8) === 1 ? 'nether' : 'end',
        //   X: key.readInt32LE(0),
        //   Z: key.readInt32LE(4),
        // }
        if (key.length === 13) {
          // nether/end not a subchunk (skipped for now)
        } else if (key.length === 14) {
          // nether/end subchunk (skipped for now)
        }
      }
    }
  }

  async chunk (coords) {
    const chunkData = this[_chunks][coords]
    const chunk = new Chunk(chunkData)
    const subChunkKeys = chunkData.subChunkKeys
    for (let i = 0; i < subChunkKeys.length; i++) {
      log.debug(`Reading subchunk ${i}`)
      const data = await this.dbGet(subChunkKeys[i])
      chunkData.subChunkValues.push(data)
      chunk.addSubChunk(data, i)
    }
    return chunk
  }

  async renderChunk (coords, outputPath, limitTo) {
    const chunkData = this[_chunks][coords]
    if (limitTo) {
      if ((limitTo.X !== chunkData.X) || (limitTo.Z !== chunkData.Z)) {
        return
      }
      log.debug('Rendering single chunk %o',limitTo)
    }
    const chunk = await this.chunk(coords)

    await chunk.render(16, this.bounds, this.zoomLevelMax, outputPath)
  }
}
