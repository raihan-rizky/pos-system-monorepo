const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'clear_locks.js'), 'utf8');

for (const databaseUrl of [undefined, 'postgresql://example.invalid/test']) {
  test(`clear_locks refuses to connect with ${databaseUrl ? 'a' : 'no'} database URL`, () => {
    let connections = 0;
    let queries = 0;
    const processStub = { env: { DATABASE_URL: databaseUrl }, exitCode: 0 };
    const errors = [];
    class FakePrismaClient {
      constructor() { connections += 1; }
      async $executeRawUnsafe() { queries += 1; return 0; }
      async $disconnect() {}
    }
    vm.runInNewContext(script, {
      require: () => ({ PrismaClient: FakePrismaClient }),
      process: processStub,
      console: { error: (message) => errors.push(message), log() {} },
    });
    assert.equal(connections, 0, 'the deprecated utility must not connect');
    assert.equal(queries, 0, 'the deprecated utility must not terminate sessions');
    assert.equal(processStub.exitCode, 1);
    assert.ok(errors.length > 0, 'the operator should receive an explanation');
  });
}

test('clear_locks does not embed a PostgreSQL connection string', () => {
  assert.doesNotMatch(script, /postgres(?:ql)?:\/\//i);
});
