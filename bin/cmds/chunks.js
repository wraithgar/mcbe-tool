exports.command = 'chunks'
exports.desc = 'show all chunks'

exports.builder = yargs => yargs

exports.handler = async function (argv) {
  const Level = require('../../lib/level')
  const level = new Level(argv.level)
  const log = require('../../lib/log')

  let count = 0
  await level.findChunks()
  // TODO move this logic into chunk?
  // TODO lookup table
  for (const coords in level.chunks) {
    const chunk = level.chunks[coords]
    if (chunk.Data2D) {
      count++
      const d = await level.dbGet(chunk.Data2D)
      log.out(`Chunk at X=${chunk.X} Z=${chunk.Z} has data2d ${d.length}`)
      const elevations = []
      const biomes = []
      for (let i = 0; i < 256; i++) {
        elevations[i] = d.readInt16LE(i * 2)
        biomes[i] = d.readInt8(i + 512)
      }
      log.out('elevations', elevations.slice(16))
      log.out('biomes', biomes.slice(16))
    }
  }
  log.out(`${count} of ${Object.keys(level.chunks).length} chunks had data2d`)
}
