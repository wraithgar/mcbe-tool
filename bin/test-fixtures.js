'use strict'

const fixtures = require('../test/fixtures')
const promisify = require('@gar/promisify')
const fs = promisify(require('fs'))
const path = require('path')

// Creates a test fixture leveldb for extra debugging.  Was used to find
// https://github.com/extremeheat/node-leveldb-zlib/issues/8
const main = async () => {
  const dbPath = path.join('test', 'fixtures', 'dump')
  await fs.mkdir(dbPath, { recursive: true })
  const db = new fixtures.DB({ path: dbPath })
  await db.addFixtures([
    'chunk-0-0',
    'chunk-0-1',
    'string-keys'
  ])
}
main()
