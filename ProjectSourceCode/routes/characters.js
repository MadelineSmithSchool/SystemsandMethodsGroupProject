const express = require('express');

const router = express.Router();

router.get('/new', (req, res) => {
  res.render('pages/character-builder', { title: 'Character Builder' });
});

module.exports = router;
