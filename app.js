// Gerekli modülleri ve yapılandırmaları ekleyin
const express = require("express");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const ejs = require("ejs");

// Uygulama ve Sunucu Ayarları
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Modüller ve Rota Dosyaları
const dbConn = require("./db/mysql_connect");
const analyticsRoutes = require('./routes/analytics');

// Public klasörü ve middleware ayarları
const publicDirectory = path.join(__dirname, './public');
app.use(express.static(publicDirectory));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // JSON veri okuma desteği

// View Engine Ayarları
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Rota Tanımları
app.use('/analytics', analyticsRoutes);

// Ana Sayfa
app.get('/', (req, res) => {
    res.render('index');
});

// Giriş İşlemi
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    dbConn.query(
        "SELECT * FROM yonetici WHERE yonetici_ad = ? AND sifre = ?",
        [username, password],
        (err, results) => {
            if (err) {
                console.error("Veritabanı Hatası:", err);
                res.status(500).send("Veritabanı hatası");
            } else {
                if (results.length > 0) {
                    // Login başarılı, şube sayfasına yönlendirme
                    res.redirect("/analytics/sube");
                } else {
                    // Login başarısız, ana sayfaya yönlendirme
                    res.redirect("/");
                }
            }
        }
    );
});

// Sayfa Bulunamadı Middleware (404)
app.use((req, res) => {
    res.status(404).send("Sayfa Bulunamadı!");
});

// Sunucuyu Dinle
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server başlatıldı. Port = ${PORT}`);
});