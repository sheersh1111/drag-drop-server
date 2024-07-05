const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: 'localhost', 
  user: 'root', 
  password: 'root',
  database: 'root',
  connectionLimit: 10,  // Increased from 5 to 10
  acquireTimeout: 10000
});

module.exports = pool;
