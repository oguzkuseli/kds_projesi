const mysql = require('mysql2');
require('dotenv').config();

// Veritabanı bağlantısını oluştur
const connection = mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE
});

// Bağlantıyı test et
connection.connect((err) => {
  if (err) {
    console.error('Veritabanı bağlantısı başarısız:', err.message);
  } else {
    console.log('Veritabanına başarıyla bağlanıldı.');
  }
});

module.exports = connection;

