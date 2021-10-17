exports.command = 'level'
exports.desc = 'show info about the level'

exports.builder = yargs => yargs

exports.handler = async function (argv) {
  const Level = require('../../lib/level')
  const level = new Level(argv.level)

  await level.parse()
  const dat = level.dat
  console.log(`Name: ${dat.LevelName.value}`)
  console.log(`Seed: ${dat.RandomSeed.value}`)
  console.log(`Inventory version: ${dat.InventoryVersion.value}`)
  console.log(`Spawn point z,x: ${dat.SpawnZ.value},${dat.SpawnX.value} (radius ${dat.spawnradius.value})`)
}
