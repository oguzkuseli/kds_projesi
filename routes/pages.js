// pages.js

const express = require('express');
const router = express.Router();

// Diğer rotalar
router.get('/', (req, res) => {
    res.render('index');
});
router.get('/homepage', (req, res) => {
    res.render('homepage');
});

router.get('/navbar', (req, res) => {
    res.render('navbar');
});

router.get('/egitmen', (req, res) => {
    res.render('egitmen');
});

module.exports = router;