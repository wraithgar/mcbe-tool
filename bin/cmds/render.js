exports.command = 'render'
exports.desc = 'render the map files'

exports.builder = yargs => yargs
  .options({
    output: {
      description: 'output path',
      type: 'string',
      alias: 'o',
      default: './output'
    },
    chunk: {
      description: 'specify chunk to render',
      type: 'string',
      alias: 'c'
    },
    single: {
      description: 'only render a single chunk',
      type: 'boolean',
      alias: 's',
      default: false
    }
  })

exports.handler = async function (argv) {
  const log = require('../../lib/log')
  const CliProgress = require('cli-progress')
  const Level = require('../../lib/level')
  let bar

  if (!argv.debug) {
    // bar = new CliProgress.SingleBar({ fps: 1 }, CliProgress.Presets.shades_classic)
  }
  const level = new Level(argv.level)

  log.info(`Rendering "${await level.name}" to ${argv.output}`)

  log.info('Iterating through db, this could take awhile on larger worlds')

  // Iterate through the whole db first to discover our bounds
  await level.findChunks()

  log.info('Done')
  log.debug(`Allocated ${Math.round((process.memoryUsage().heapUsed / Math.pow(1024, 2)))}MB of memory when iterating through the database.`)

  log.info(`World reaches from chunks (${level.chunkX[0]},${level.chunkZ[0]}) to (${level.chunkX[1]},${level.chunkZ[1]}) (x,z) with zoomLevelMax ${level.zoomLevelMax}`)
  log.debug(`Processing and rendering ${level.chunkCount} chunks, containing ${level.subChunkCount} valid SubChunks...`)

  try {
    bar && bar.start(level.chunkCount, 0)
    for (const coords in level.chunks) {
      bar && bar.increment()
      await level.renderChunk(coords, argv.output, argv.chunk)
      if (argv.single) {
        break
      }
    }
    bar && bar.stop()
  } catch (err) {
    bar && bar.stop()
    throw err
  }
}
