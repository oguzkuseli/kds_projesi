const express = require('express');
const router = express.Router();
const connection = require('../db/mysql_connect');

// Ortak SQL Query Fonksiyonu
function executeQuery(query, params, res, successMessage) {
    connection.query(query, params, (err, results) => {
        if (err) {
            console.error(successMessage, err.message);
            return res.status(500).json({ error: "Veri alınırken hata oluştu." });
        }
        if (!results || results.length === 0) {
            return res.status(404).json({ error: "Veri bulunamadı." });
        }
        res.json(results);
    });
}

// Şubeye Göre Gelir Dağılımı
router.get('/income-by-branch', (req, res) => {
    const query = `
        SELECT sube_ad, SUM(gelir) AS toplam_gelir
        FROM gelir
        GROUP BY sube_ad;
    `;
    executeQuery(query, [], res, "Gelir sorgusunda hata:");
});

// Şubeye Göre Gider Dağılımı
router.get('/expense-by-branch', (req, res) => {
    const query = `
        SELECT sube_ad, SUM(gider) AS toplam_gider
        FROM gider
        GROUP BY sube_ad;
    `;
    executeQuery(query, [], res, "Gider sorgusunda hata:");
});

// Gelir ve Gider Karşılaştırması
router.get('/income-expense-comparison', (req, res) => {
    const query = `
        SELECT g.sube_ad,
               IFNULL(SUM(g.gelir), 0) AS toplam_gelir,
               IFNULL(SUM(d.gider), 0) AS toplam_gider
        FROM gelir g
        LEFT JOIN gider d ON g.sube_id = d.sube_id
        GROUP BY g.sube_ad;
    `;
    executeQuery(query, [], res, "Gelir-Gider karşılaştırma sorgusunda hata:");
});


// Şube Sayfası
router.get('/sube', (req, res) => {
    const branchPerformanceQuery = `
        SELECT 
            s.sube_id,
            s.sube_ad,
            COALESCE(SUM(k.kurs_ucret), 0) AS totalIncome,
            COALESCE((SELECT SUM(e.maas) 
                      FROM egitmen e 
                      WHERE e.sube_id = s.sube_id), 0) AS totalExpense,
            (COALESCE(SUM(k.kurs_ucret), 0) - 
             COALESCE((SELECT SUM(e.maas) 
                       FROM egitmen e 
                       WHERE e.sube_id = s.sube_id), 0)) AS netProfit
        FROM sube s
        LEFT JOIN uye u ON s.sube_id = u.sube_id
        LEFT JOIN uye_kurs uk ON u.uye_id = uk.uye_id
        LEFT JOIN kurs k ON uk.kurs_id = k.kurs_id
        GROUP BY s.sube_id, s.sube_ad;
    `;

    connection.query(branchPerformanceQuery, (err, branchResults) => {
        if (err) {
            console.error('Şube performans verisi alınırken hata:', err.message);
            return res.status(500).send('Hata oluştu.');
        }

        // Genel toplam hesaplamaları
        const totalIncome = branchResults.reduce((sum, branch) => sum + Number(branch.totalIncome), 0);
        const totalExpense = branchResults.reduce((sum, branch) => sum + Number(branch.totalExpense), 0);
        const netProfit = totalIncome - totalExpense;

        // Tavsiyeler ekleniyor
        const branchesWithRecommendations = branchResults.map(branch => {
            let recommendation = '';
            if (branch.netProfit > 0 && branch.netProfit > branch.totalIncome * 0.2) {
                recommendation = 'Şubeyi genişletmeyi düşünün veya yeni hizmetler ekleyin.';
            } else if (branch.netProfit > 0) {
                recommendation = 'Promosyon kampanyaları düzenleyin.';
            } else {
                recommendation = 'Maliyetleri azaltmayı veya şubeyi kapatmayı düşünün.';
            }
            return { ...branch, recommendation };
        });

        res.render('sube', {
            summary: {
                totalIncome: totalIncome.toLocaleString('tr-TR'),
                totalExpense: totalExpense.toLocaleString('tr-TR'),
                netProfit: netProfit.toLocaleString('tr-TR'),
                totalBranches: branchResults.length
            },
            branches: branchesWithRecommendations,
            performanceData: {
                labels: branchResults.map(row => row.sube_ad),
                income: branchResults.map(row => row.totalIncome),
                expense: branchResults.map(row => row.totalExpense)
            }
        });
    });
});

// Şube Ekleme
router.post('/sube/ekle', (req, res) => {
    const { subeAd } = req.body; // Sadece şube adı alınıyor

    const insertQuery = `
        INSERT INTO sube (sube_ad)
        VALUES (?)
    `;
    connection.query(insertQuery, [subeAd], (err) => {
        if (err) {
            console.error('Şube ekleme sırasında hata:', err.message);
            return res.status(500).send('Şube eklenirken hata oluştu.');
        }
        res.redirect('/analytics/sube');
    });
});

// Şube Silme
router.post('/sube/sil', (req, res) => {
    const { subeId } = req.body;

    const deleteQuery = `
        DELETE FROM sube
        WHERE sube_id = ?
    `;
    connection.query(deleteQuery, [subeId], (err) => {
        if (err) {
            console.error('Şube silme sırasında hata:', err.message);
            return res.status(500).send('Şube silinirken hata oluştu.');
        }
        res.redirect('/analytics/sube');
    });
});

// Üye Sayfası
     router.get('/uyeler', (req, res) => {
    const { uyeAdSoyad, subeAd, cinsiyetAd, kursAd } = req.query;

    let query = `
        SELECT 
            u.uye_id,
            u.uye_ad,
            u.uye_soyad,
            s.sube_ad,
            c.cinsiyet_ad,
            u.kayit_tarih,
            GROUP_CONCAT(k.kurs_ad SEPARATOR ', ') AS kurslar
        FROM uye u
        LEFT JOIN sube s ON u.sube_id = s.sube_id
        LEFT JOIN cinsiyet c ON u.cinsiyet_id = c.cinsiyet_id
        LEFT JOIN uye_kurs uk ON u.uye_id = uk.uye_id
        LEFT JOIN kurs k ON uk.kurs_id = k.kurs_id
    `;

    const conditions = [];
    const queryParams = [];

    if (uyeAdSoyad) {
        conditions.push(`CONCAT(u.uye_ad, ' ', u.uye_soyad) LIKE ?`);
        queryParams.push(`%${uyeAdSoyad}%`);
    }
    if (subeAd) {
        conditions.push(`s.sube_ad = ?`);
        queryParams.push(subeAd);
    }
    if (cinsiyetAd) {
        conditions.push(`c.cinsiyet_ad = ?`);
        queryParams.push(cinsiyetAd);
    }
    if (kursAd) {
        conditions.push(`k.kurs_ad LIKE ?`);
        queryParams.push(`%${kursAd}%`);
    }

    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY u.uye_id ORDER BY u.uye_id;`;

    const genderQuery = `SELECT c.cinsiyet_ad AS label, COUNT(*) AS value FROM uye u LEFT JOIN cinsiyet c ON u.cinsiyet_id = c.cinsiyet_id GROUP BY c.cinsiyet_ad;`;
    const branchQuery = `SELECT s.sube_ad AS label, COUNT(*) AS value FROM uye u LEFT JOIN sube s ON u.sube_id = s.sube_id GROUP BY s.sube_ad;`;
    const subeQuery = `SELECT sube_id, sube_ad FROM sube;`;
    const kursQuery = `SELECT kurs_id, kurs_ad FROM kurs;`;
    const cinsiyetQuery = `SELECT cinsiyet_id, cinsiyet_ad FROM cinsiyet;`;

    connection.query(query, queryParams, (err, members) => {
        if (err) return res.status(500).send('Hata oluştu.');
        connection.query(genderQuery, (err, genderData) => {
            if (err) return res.status(500).send('Hata oluştu.');
            connection.query(branchQuery, (err, branchData) => {
                if (err) return res.status(500).send('Hata oluştu.');
                connection.query(subeQuery, (err, subeler) => {
                    if (err) return res.status(500).send('Hata oluştu.');
                    connection.query(kursQuery, (err, kurslar) => {
                        if (err) return res.status(500).send('Hata oluştu.');
                        connection.query(cinsiyetQuery, (err, cinsiyetler) => {
                            if (err) return res.status(500).send('Hata oluştu.');
                            res.render('uyeler', {
                                members,
                                filters: req.query,
                                genderData: { labels: genderData.map(d => d.label), values: genderData.map(d => d.value) },
                                branchData: { labels: branchData.map(d => d.label), values: branchData.map(d => d.value) },
                                subeler,
                                kurslar,
                                cinsiyetler,
                            });
                        });
                    });
                });
            });
        });
    });
});

// Üye Düzenleme
router.post('/uyeler/duzenle/:uyeId', (req, res) => {
    const { uyeId } = req.params;
    const { uyeAd, uyeSoyad, subeId, cinsiyetId, kurslar, kayitTarih } = req.body;

    if (!uyeAd || !uyeSoyad || !subeId || !cinsiyetId || !kayitTarih) {
        return res.status(400).send('Eksik veya hatalı giriş.');
    }

    const updateMemberQuery = `
        UPDATE uye 
        SET uye_ad = ?, uye_soyad = ?, sube_id = ?, cinsiyet_id = ?, kayit_tarih = ?
        WHERE uye_id = ?
    `;

    connection.query(updateMemberQuery, [uyeAd, uyeSoyad, subeId, cinsiyetId, kayitTarih, uyeId], (err) => {
        if (err) {
            console.error('Üye düzenleme hatası:', err.message);
            return res.status(500).send('Üye düzenlenirken hata oluştu.');
        }

        // Eski kurs ilişkilerini sil
        const deleteCoursesQuery = `DELETE FROM uye_kurs WHERE uye_id = ?`;
        connection.query(deleteCoursesQuery, [uyeId], (err) => {
            if (err) {
                console.error('Eski kurs ilişkileri silinirken hata:', err.message);
                return res.status(500).send('Kurs ilişkileri silinirken hata oluştu.');
            }

            // Yeni kursları ekle
            if (kurslar && kurslar.length > 0) {
                const insertCoursesQuery = `INSERT INTO uye_kurs (uye_id, kurs_id) VALUES ?`;
                const kursData = kurslar.map(kursId => [uyeId, kursId]);

                connection.query(insertCoursesQuery, [kursData], (err) => {
                    if (err) {
                        console.error('Kurs ekleme hatası:', err.message);
                        return res.status(500).send('Kurs eklenirken hata oluştu.');
                    }
                    res.redirect('/analytics/uyeler');
                });
            } else {
                res.redirect('/analytics/uyeler');
            }
        });
    });
});

// Üye Ekleme
router.post('/uyeler/ekle', (req, res) => {
    const { uyeAd, uyeSoyad, subeId, cinsiyetId, kurslar, kayitTarih } = req.body;

    if (!uyeAd || !uyeSoyad || !subeId || !cinsiyetId || !kayitTarih) {
        console.error("Eksik veya hatalı giriş.");
        return res.status(400).send("Eksik veya hatalı giriş.");
    }

    const insertMemberQuery = `
        INSERT INTO uye (uye_ad, uye_soyad, sube_id, cinsiyet_id, kayit_tarih)
        VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(insertMemberQuery, [uyeAd, uyeSoyad, subeId, cinsiyetId, kayitTarih], (err, result) => {
        if (err) {
            console.error("Üye ekleme hatası:", err.message);
            return res.status(500).send("Üye ekleme sırasında bir hata oluştu.");
        }

        const uyeId = result.insertId;

        if (kurslar && kurslar.length > 0) {
            const insertCoursesQuery = `INSERT INTO uye_kurs (uye_id, kurs_id) VALUES ?`;
            const kursData = kurslar.map(kursId => [uyeId, kursId]);

            connection.query(insertCoursesQuery, [kursData], (err) => {
                if (err) {
                    console.error("Kurs ekleme hatası:", err.message);
                    return res.status(500).send("Kurs ekleme sırasında bir hata oluştu.");
                }
                res.redirect('/analytics/uyeler');
            });
        } else {
            res.redirect('/analytics/uyeler');
        }
    });
});

// Üye Silme
router.post('/uyeler/sil/:uyeId', (req, res) => {
    const { uyeId } = req.params;

    const deleteCoursesQuery = `DELETE FROM uye_kurs WHERE uye_id = ?`;

    connection.query(deleteCoursesQuery, [uyeId], (err) => {
        if (err) {
            console.error('Kurs silme hatası:', err.message);
            return res.status(500).send('İlgili kurs kayıtları silinemedi.');
        }

        const deleteMemberQuery = `DELETE FROM uye WHERE uye_id = ?`;

        connection.query(deleteMemberQuery, [uyeId], (err) => {
            if (err) {
                console.error('Üye silme hatası:', err.message);
                return res.status(500).send('Üye silinemedi.');
            }

            res.redirect('/analytics/uyeler');
        });
    });
});

// Kurs Verilerini Getir
router.get('/kurs', (req, res) => {
    const courseQuery = `
        SELECT k.kurs_id, k.kurs_ad, k.kurs_ucret, COUNT(uk.uye_id) AS katilimci_sayisi
        FROM kurs k
        LEFT JOIN uye_kurs uk ON k.kurs_id = uk.kurs_id
        GROUP BY k.kurs_id, k.kurs_ad, k.kurs_ucret
        ORDER BY k.kurs_ad ASC;
    `;

    connection.query(courseQuery, (err, courses) => {
        if (err) {
            console.error("Kurs verisi alınırken hata oluştu:", err.message);
            return res.status(500).send("Hata oluştu.");
        }

        const courseFeeData = {
            labels: courses.map(course => course.kurs_ad),
            values: courses.map(course => course.kurs_ucret)
        };

        const participantData = {
            labels: courses.map(course => course.kurs_ad),
            values: courses.map(course => course.katilimci_sayisi)
        };

        res.render('kurs', {
            courses,
            courseFeeData,
            participantData
        });
    });
});

// Kurs Ekle
router.post('/kurs/ekle', (req, res) => {
    const { kursAd, kursUcret } = req.body;

    const insertQuery = `INSERT INTO kurs (kurs_ad, kurs_ucret) VALUES (?, ?)`;
    connection.query(insertQuery, [kursAd, kursUcret], (err) => {
        if (err) {
            console.error('Kurs ekleme hatası:', err.message);
            return res.status(500).send('Kurs eklenemedi.');
        }
        res.redirect('/analytics/kurs');
    });
});

// Kurs Düzenle
router.post('/kurs/duzenle/:kursId', (req, res) => {
    const { kursId } = req.params;
    const { kursUcret } = req.body;

    const updateQuery = `UPDATE kurs SET kurs_ucret = ? WHERE kurs_id = ?`;
    connection.query(updateQuery, [kursUcret, kursId], (err) => {
        if (err) {
            console.error('Kurs düzenleme hatası:', err.message);
            return res.status(500).send('Kurs düzenlenemedi.');
        }
        res.redirect('/analytics/kurs');
    });
});

// Kurs Sil
router.post('/kurs/sil/:kursId', (req, res) => {
    const { kursId } = req.params;

    const deleteQuery = `DELETE FROM kurs WHERE kurs_id = ?`;
    connection.query(deleteQuery, [kursId], (err) => {
        if (err) {
            console.error('Kurs silme hatası:', err.message);
            return res.status(500).send('Kurs silinemedi.');
        }
        res.redirect('/analytics/kurs');
    });
});

// Eğitmen Sayfası 
router.get('/egitmen', (req, res) => {
    // Query for trainer data and salary status
    const trainerQuery = `
        SELECT e.egitmen_id, e.egitmen_ad, e.egitmen_soyad, u.uzmanlik_ad, s.sube_ad, e.maas,
        CASE 
            WHEN e.maas > (SELECT AVG(maas) FROM egitmen) * 1.2 THEN 'Yüksek Maaş (Gözden Geçir)'
            ELSE 'İdeal Maaş'
        END AS maasDurumu
        FROM egitmen e
        LEFT JOIN sube s ON e.sube_id = s.sube_id
        LEFT JOIN uzmanlik u ON e.uzmanlik_id = u.uzmanlik_id
    `;

    const subeQuery = `SELECT sube_id, sube_ad FROM sube`;
    const uzmanlikQuery = `SELECT uzmanlik_id, uzmanlik_ad FROM uzmanlik`;

    connection.query(trainerQuery, (err, trainers) => {
        if (err) {
            console.error("Eğitmen verisi alınırken hata oluştu:", err.message);
            return res.status(500).send("Hata oluştu.");
        }

        // Salary Graph Data
        const salaryData = {
            labels: trainers.map(tr => `${tr.egitmen_ad} ${tr.egitmen_soyad}`),
            values: trainers.map(tr => tr.maas)
        };

        // Trainer Count by Branch
        const trainerCountQuery = `
            SELECT s.sube_ad, COUNT(*) AS count
            FROM egitmen e
            LEFT JOIN sube s ON e.sube_id = s.sube_id
            GROUP BY s.sube_ad
        `;

        connection.query(trainerCountQuery, (err, trainerCounts) => {
            if (err) return res.status(500).send("Şube verisi alınırken hata oluştu.");

            const trainerCountData = {
                labels: trainerCounts.map(tc => tc.sube_ad),
                values: trainerCounts.map(tc => tc.count)
            };

            // Average Salary by Specialization
            const avgSalaryQuery = `
                SELECT u.uzmanlik_ad, AVG(e.maas) AS avg_salary
                FROM egitmen e
                LEFT JOIN uzmanlik u ON e.uzmanlik_id = u.uzmanlik_id
                GROUP BY u.uzmanlik_ad
            `;

            connection.query(avgSalaryQuery, (err, avgSalaries) => {
                if (err) return res.status(500).send("Uzmanlık verisi alınırken hata oluştu.");

                const avgSalaryData = {
                    labels: avgSalaries.map(as => as.uzmanlik_ad),
                    values: avgSalaries.map(as => as.avg_salary)
                };

                // Total Salary by Branch
                const totalSalaryQuery = `
                    SELECT s.sube_ad, SUM(e.maas) AS total_salary
                    FROM egitmen e
                    LEFT JOIN sube s ON e.sube_id = s.sube_id
                    GROUP BY s.sube_ad
                `;

                connection.query(totalSalaryQuery, (err, totalSalaries) => {
                    if (err) return res.status(500).send("Maaş toplam verisi alınırken hata oluştu.");

                    const totalSalaryData = {
                        labels: totalSalaries.map(ts => ts.sube_ad),
                        values: totalSalaries.map(ts => ts.total_salary)
                    };

                    // Fetch Subes and Specializations
                    connection.query(subeQuery, (err, subeler) => {
                        if (err) return res.status(500).send("Şube verisi alınırken hata oluştu.");

                        connection.query(uzmanlikQuery, (err, uzmanliklar) => {
                            if (err) return res.status(500).send("Uzmanlık verisi alınırken hata oluştu.");

                            // Render Eğitmen Page
                            res.render('egitmen', {
                                trainers,
                                salaryData,
                                trainerCountData,
                                avgSalaryData,
                                totalSalaryData,
                                subeler,
                                uzmanliklar
                            });
                        });
                    });
                });
            });
        });
    });
})

// Eğitmen Ekleme 
router.post('/egitmen/add', (req, res) => {
    const { egitmenAd, egitmenSoyad, maas, subeId, uzmanlikId } = req.body;

    const insertQuery = `
        INSERT INTO egitmen (egitmen_ad, egitmen_soyad, maas, sube_id, uzmanlik_id)
        VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(insertQuery, [egitmenAd, egitmenSoyad, maas, subeId, uzmanlikId], (err, results) => {
        if (err) {
            console.error("Eğitmen eklenirken hata oluştu:", err.message);
            return res.status(500).send("Eğitmen eklenirken hata oluştu.");
        }

        console.log("Eğitmen başarıyla eklendi.");
        res.redirect('/analytics/egitmen'); // Refresh the page to show updated data
    });
});

// Eğitmen Düzenleme
router.post('/egitmen/edit', (req, res) => {
    const { egitmenId, egitmenAd, egitmenSoyad, maas, subeId, uzmanlikId } = req.body;
    const updateQuery = `
        UPDATE egitmen 
        SET egitmen_ad = ?, egitmen_soyad = ?, maas = ?, sube_id = ?, uzmanlik_id = ? 
        WHERE egitmen_id = ?
    `;
    const params = [egitmenAd, egitmenSoyad, maas, subeId, uzmanlikId, egitmenId];

    connection.query(updateQuery, params, (err) => {
        if (err) {
            console.error("Eğitmen güncelleme hatası:", err.message);
            return res.status(500).send("Eğitmen güncellenemedi.");
        }
        res.redirect('/analytics/egitmen');
    });
});

// Eğitmen Silme
router.post('/egitmen/delete', (req, res) => {
    const { egitmenId } = req.body;
    const deleteQuery = `DELETE FROM egitmen WHERE egitmen_id = ?`;

    connection.query(deleteQuery, [egitmenId], (err) => {
        if (err) {
            console.error("Eğitmen silme hatası:", err.message);
            return res.status(500).send("Eğitmen silinemedi.");
        }
        res.redirect('/analytics/egitmen');
    });
});

module.exports = router;
