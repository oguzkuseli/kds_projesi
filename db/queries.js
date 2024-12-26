const connection = require('./mysql_connect');

// Gelir Hesaplama
const calculateIncome = (callback) => {
  connection.query('CALL gelir_hesapla()', (err, results) => {
    if (err) {
      return callback(err);
    }
    callback(null, results[0]); // İlk sonuç seti
  });
};

// Gider Hesaplama
const calculateExpenses = (callback) => {
  connection.query('CALL gider_hesapla()', (err, results) => {
    if (err) {
      return callback(err);
    }
    callback(null, results[0]);
  });
};

// Net Gelir Hesaplama
const calculateNetIncome = (callback) => {
  connection.query('CALL net_gelir_hesapla()', (err, results) => {
    if (err) {
      return callback(err);
    }
    callback(null, results[0]);
  });
};


module.exports = { calculateIncome, calculateExpenses, calculateNetIncome };