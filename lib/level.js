'use strict'

const promisify = require('@gar/promisify')

const fs = promisify(require('fs'))
const path = require('path')

const { LevelDB } = require('leveldb-zlib')

const { parse: nbtParse } = require('prismarine-nbt')

const Chunk = require('./chunk.js')
const log = require('./log')

const _chunkX = Symbol('chunkX')
const _chunkZ = Symbol('chunkZ')
const _chunks = Symbol('chunks')
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
    this[_chunks] = {}
    this[_subChunkCount] = 0
    this[_chunkX] = [0, 0]
    this[_chunkZ] = [0, 0]
  }

  get yThreshold () {
    return 256
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

  get chunkX () {
    return [...this[_chunkX]]
  }

  get chunkZ () {
    return [...this[_chunkZ]]
  }

  get zoomLevelMax () {
    return this[_zoomLevelMax]
  }

  get worldOffset () {
    return { x: this[_chunkX], z: this[_chunkZ] }
  }

  async parse () {
    const { parsed } = await nbtParse(await this[_nbt])
    this[_dat] = parsed.value
  }

  dbGet (key) {
    return this[_db].get(key)
  }

  // TODO merge into findSubChunks w/ a _chunks object instead of array
  // { key, biome, elevation, version, subChunks: [] }
  async findChunks () {
    await this[_openPromise]

    const iter = this[_db].getIterator()
    let entry
    entry = await iter.next()
    while (entry) {
      const [, key] = entry

      const coords = key.slice(0, 8).toString('hex')
      const keyType = key.readInt8(8)
      if (!this[_chunks][coords]) {
        this[_chunks][coords] = {
          X: key.readInt32LE(0),
          Z: key.readInt32LE(4),
          subChunks: []
        }
      }
      const chunk = this[_chunks][coords]
      // https://minecraft.fandom.com/wiki/Bedrock_Edition_level_format
      if (key.length === 9) {
        if (keyType === 44 || keyType === 118) {
          // chunkVersion
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
        } else if (keyType === 58) {
          // random ticks
        }
      } else if (key.length === 10) {
        if (keyType === 47) {
          // subChunkPrefix
          chunk.subChunks.push(key)
          this[_subChunkCount]++
        }
      }

      entry = await iter.next()
    }
    this.findBounds()
  }

  // Finds chunk bounds and sets zoomLevelMax
  findBounds () {
    for (const coords in this[_chunks]) {
      if (this[_chunks][coords].X <= this[_chunkX][0]) {
        this[_chunkX][0] = this[_chunks][coords].X
      }
      if (this[_chunks][coords].X >= this[_chunkX][1]) {
        this[_chunkX][1] = this[_chunks][coords].X
      }
      if (this[_chunks][coords].Z <= this[_chunkZ][0]) {
        this[_chunkZ][0] = this[_chunks][coords].Z
      }
      if (this[_chunks][coords].Z >= this[_chunkZ][1]) {
        this[_chunkZ][1] = this[_chunks][coords].Z
      }
    }

    this[_zoomLevelMax] = Math.round(Math.log2((this[_chunkX][1] - this[_chunkX][0])))
    if ((this[_chunkX][1] - this[_chunkX][0]) < (this[_chunkZ][1] - this[_chunkZ][0])) {
      this[_zoomLevelMax]++
    }
  }

  async renderChunk (coords, outputPath, limitTo) {
    const chunk = new Chunk(coords, this.yThreshold)
    if (limitTo) {
      if ([chunk.X, chunk.Z].join(',') !== limitTo) {
        return
      }
      log.debug(`Rendering single chunk ${limitTo}`)
    }

    const subChunks = this[_chunks][coords].subChunks
    for (let i = 0; i < subChunks.length; i++) {
      const pointer = subChunks[i]
      const data = await this.dbGet(pointer)
      chunk.read(Buffer.from(data), i)
    }

    await chunk.render(16, this.worldOffset, this.zoomLevelMax, outputPath)
  }
}
