module.exports = {
  out: console.log,
  debug: require('debug')('mcbe-tool:debug'),
  error: require('debug')('mcbe-tool:error'),
  info: require('debug')('mcbe-tool:info')
}
