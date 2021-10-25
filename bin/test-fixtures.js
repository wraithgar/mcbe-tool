'use strict'

const fixtures = require('../test/fixtures')
const promisify = require('@gar/promisify')
const fs = promisify(require('fs'))
const path = require('path')
const { LevelDB } = require('leveldb-zlib')

// Creates a test fixture leveldb for extra debugging, then dumps its keys.
// Was used to find https://github.com/extremeheat/node-leveldb-zlib/issues/8
// and verify its fix
const main = async () => {
  const dbPath = path.join('test', 'fixtures', 'dump')
  await fs.mkdir(dbPath, { recursive: true })
  const db = new LevelDB(path.join(dbPath, 'db'), { createIfMissing: true })
  await db.open()
  for (const filename of [
    'string-keys',
    'chunk-0-1',
    'chunk-0-0',
  ]) {
    const fixture = require(path.resolve('.', 'test', 'fixtures', `${filename}.json`))
    for (const keyString in fixture) {
      const key = Buffer.from(keyString, 'hex')
      const data = Buffer.from(fixture[keyString], 'hex')
      if (!await db.put(key, data, { sync: true })) {
        throw new Error('failed writing to leveldb')
      }
    }
  }
  const iter = db.getIterator()
  let entry
  for (let i = 0; entry = await iter.next(); i++) {
    console.log(entry[1].toString('hex'))
  }
}
main()
