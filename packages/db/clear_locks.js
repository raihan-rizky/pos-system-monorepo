'use strict';

console.error(
  'Skrip ini dinonaktifkan karena dapat memutus koneksi database lain. Gunakan prosedur pemeliharaan yang aman untuk menangani sesi terkunci.',
);
process.exitCode = 1;
