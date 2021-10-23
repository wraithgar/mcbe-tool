exports.command = 'level'
exports.desc = 'show info about the level'

exports.builder = yargs => yargs

exports.handler = async function (argv) {
  const log = require('../../lib/log')
  const Level = require('../../lib/level')
  const level = new Level(argv.level)

  await level.parse()
  const dat = level.dat
  log.out(`Name: ${dat.LevelName.value}`)
  log.out(`Seed: ${dat.RandomSeed.value}`)
  log.out(`Inventory version: ${dat.InventoryVersion.value}`)
  log.out(`Spawn point z,x: ${dat.SpawnZ.value},${dat.SpawnX.value} (radius ${dat.spawnradius.value})`)
}
