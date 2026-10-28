// Splits the test files between CI shards (`jest --shard=i/n`, #248) so
// each shard gets about the same work. Jest's own split hashes the paths,
// which left one shard almost twice as long as the other. CI has no timing
// cache, so file size stands in for run time: the biggest files go first,
// each to the shard with the fewest bytes so far. Every shard computes the
// same split from the same file list, so no file runs twice or never.
const fs = require('node:fs');
const Sequencer = require('@jest/test-sequencer').default;

class ShardSequencer extends Sequencer {
  shard(tests, { shardIndex, shardCount }) {
    const sized = tests
      .map((test) => ({ test, size: fs.statSync(test.path).size }))
      .sort((a, b) => b.size - a.size || a.test.path.localeCompare(b.test.path));
    const load = new Array(shardCount).fill(0);
    const mine = [];
    for (const { test, size } of sized) {
      let target = 0;
      for (let i = 1; i < shardCount; i += 1) if (load[i] < load[target]) target = i;
      load[target] += size;
      if (target === shardIndex - 1) mine.push(test);
    }
    return mine;
  }
}

module.exports = ShardSequencer;
