
const { LevelDB } = require('leveldb-zlib')
const path = require('path')

// Was used to find https://github.com/extremeheat/node-leveldb-zlib/issues/8
const main = async () => {
  const dbPath = path.join('test', 'fixtures', 'dump', 'db')
  const db = new LevelDB(dbPath)
  await db.open()
  const iter = db.getIterator({ keys: true, values: true })
  while (entries = await iter.next()) {
    for (let i = 0; i < entries.length; i = i + 2) {
      const entry = { key: entries[i+1], value: entries[i] }
      console.log(entry.key.toString('hex'))
    }
  }
  await db.close()
  // console.log(total/2)
}
main()
