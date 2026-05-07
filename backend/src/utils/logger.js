'use strict';

function log(level, message, meta) {
  const entry = { ts: new Date().toISOString(), level, message };
  if (meta) entry.meta = meta;
  console.log(JSON.stringify(entry));
}

module.exports = {
  info:  (msg, meta) => log('INFO',  msg, meta),
  warn:  (msg, meta) => log('WARN',  msg, meta),
  error: (msg, meta) => log('ERROR', msg, meta),
};
