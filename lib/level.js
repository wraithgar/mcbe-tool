'use strict'

const promisify = require('@gar/promisify')

const fs = promisify(require('fs'))
const path = require('path')

const { LevelDB } = require('leveldb-zlib')

const Chunk = require('./chunk.js')
const log = require('./log')

const _db = Symbol('db')
const _chunkKeys = Symbol('chunkKeys')
const _name = Symbol('name')
const _openPromise = Symbol('openPromise')
const _subChunkCount = Symbol('subChunkCount')
const _chunkX = Symbol('chunkX')
const _chunkZ = Symbol('chunkZ')
const _zoomLevelMax = Symbol('zoomLevelMax')
const _outputPath = Symbol('_outputPath')

module.exports = class Level {
  constructor (levelPath, outputPath) {
    this[_name] = fs.readFile(path.join(levelPath, 'levelname.txt'))
    this[_db] = new LevelDB(path.join(levelPath, 'db'))
    this[_openPromise] = this[_db].open()
    this[_chunkKeys] = {}
    this[_subChunkCount] = 0
    this[_chunkX] = [0, 0]
    this[_chunkZ] = [0, 0]
    this[_outputPath] = outputPath
  }

  get yThreshold () {
    return 256
  }

  get name () {
    return this[_name]
  }

  get chunkCount () {
    return Object.keys(this[_chunkKeys]).length
  }

  get subChunkCount () {
    return this[_subChunkCount]
  }

  // TODO protect contents? Iterator?
  get chunkKeys () {
    return this[_chunkKeys]
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

  async iterate () {
    await this[_openPromise]

    // This is not actually iterable?
    const iter = this[_db].getIterator()

    let entry
    entry = await iter.next()
    while (entry) {
      const [, key] = entry
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
       */

      // key length 10 should always be a type 47 but we still test for both
      if (key.length === 10 && key.readInt8(8) === 47)  {
        const coords = key.slice(0, 8).toString('hex')
        if (!this[_chunkKeys][coords]) {
          this[_chunkKeys][coords] = []
        } else {
          // console.log({ x: key.readInt32LE(0), z: key.readInt32LE(4) })
        }
        this[_chunkKeys][coords].push(key)
        this[_subChunkCount]++
      }
      entry = await iter.next()
    }

    // Find XZ bounds
    for (const key in this[_chunkKeys]) {
      if (this[_chunkKeys][key][0].readInt32LE(0) <= this[_chunkX][0]) {
        this[_chunkX][0] = this[_chunkKeys][key][0].readInt32LE(0)
      }
      if (this[_chunkKeys][key][0].readInt32LE(0) >= this[_chunkX][1]) {
        this[_chunkX][1] = this[_chunkKeys][key][0].readInt32LE(0)
      }
      if (this[_chunkKeys][key][0].readInt32LE(4) <= this[_chunkZ][0]) {
        this[_chunkZ][0] = this[_chunkKeys][key][0].readInt32LE(4)
      }
      if (this[_chunkKeys][key][0].readInt32LE(4) >= this[_chunkZ][1]) {
        this[_chunkZ][1] = this[_chunkKeys][key][0].readInt32LE(4)
      }
    }
    this[_zoomLevelMax] = Math.round(Math.log2((this[_chunkX][1] - this[_chunkX][0])))
    if ((this[_chunkX][1] - this[_chunkX][0]) < (this[_chunkZ][1] - this[_chunkZ][0])) {
      this[_zoomLevelMax]++
    }
  }

  // Belongs in Chunk class?
  async subChunks (coords) {
    const subChunks = []
    // subkeys belongs in chunk
    for (const pointer of this[_chunkKeys][coords]) {
      const data = await this[_db].get(pointer)
      subChunks.push(data)
    }
    return subChunks
  }

  // Belongs in Chunk class?
  async readChunk (chunk) {
    const subChunks = await this.subChunks(chunk.coords)
    for (let i = 0; i < subChunks.length; i++) {
      chunk.read(Buffer.from(subChunks[i]), i)
    }
  }

  async renderChunk (key, limitTo) {
    const chunk = new Chunk(key, this.yThreshold)
    if (limitTo) {
      if ([chunk.X, chunk.Z].join(',') !== limitTo) {
        return
      }
      log.debug(`Rendering single chunk ${limitTo}`)
    }
    await this.readChunk(chunk)
    await chunk.render(16, this.worldOffset, this.zoomLevelMax, this[_outputPath])
  }
}
