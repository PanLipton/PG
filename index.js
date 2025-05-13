const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');
const codeGeneratorService = require('./codeGeneratorService');
const testingService = require('./testingService');

// Ініціалізація додатку
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Налаштування шаблонізатора
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Проміжне ПЗ
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Створюємо потрібні папки якщо їх немає
const dirs = ['public', 'public/css', 'public/js', 'views', 'flowcharts', 'generated_code', 'tests', 'temp'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
});

// Маршрути
app.get('/', (req, res) => {
  res.render('index');
});

// Зберігання даних блок-схеми
app.post('/save-flowchart', (req, res) => {
  const { name, data } = req.body;
  if (!name || !data) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  fs.writeFileSync(path.join(__dirname, 'flowcharts', `${name}.json`), JSON.stringify(data));
  res.json({ success: true });
});

// Завантаження даних блок-схеми
app.get('/load-flowchart/:name', (req, res) => {
  const name = req.params.name;
  try {
    const data = fs.readFileSync(path.join(__dirname, 'flowcharts', `${name}.json`), 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(404).json({ error: 'Flowchart not found' });
  }
});

// Список всіх збережених блок-схем
app.get('/flowcharts', (req, res) => {
  const files = fs.readdirSync(path.join(__dirname, 'flowcharts')).filter(f => f.endsWith('.json'));
  const flowcharts = files.map(f => f.replace('.json', ''));
  res.json(flowcharts);
});

// Генерація коду з блок-схем
app.post('/generate-code', (req, res) => {
  const { flowcharts, language } = req.body;
  if (!flowcharts || !language) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    const code = codeGeneratorService.generateCode(flowcharts, language);
    res.json({ success: true, code });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Збереження тест-кейсу
app.post('/save-test', (req, res) => {
  const { name, input, expectedOutput } = req.body;
  if (!name || input === undefined || expectedOutput === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  fs.writeFileSync(
    path.join(__dirname, 'tests', `${name}.json`), 
    JSON.stringify({ input, expectedOutput })
  );
  res.json({ success: true });
});

// Список всіх тест-кейсів
app.get('/tests', (req, res) => {
  const files = fs.readdirSync(path.join(__dirname, 'tests')).filter(f => f.endsWith('.json'));
  const tests = files.map(f => f.replace('.json', ''));
  res.json(tests);
});

// Запуск тесту на блок-схемах
app.post('/run-test', async (req, res) => {
  const { flowcharts, testName } = req.body;
  if (!flowcharts || !testName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    const result = await testingService.runTest(flowcharts, testName);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Зупинка поточного тесту
app.post('/stop-test', (req, res) => {
  const stopped = testingService.stopCurrentTest();
  res.json({ success: stopped });
});

// Перевірка покриття тестами
app.post('/check-coverage', (req, res) => {
  const { maxOperations } = req.body;
  
  if (!maxOperations || maxOperations < 1 || maxOperations > 20) {
    return res.status(400).json({ error: 'Invalid maxOperations value' });
  }
  
  try {
    const coverage = testingService.calculateCoverage(maxOperations);
    res.json({ 
      success: true, 
      coverage: coverage.percentage,
      testedCombinations: coverage.testedCombinations,
      totalPossible: coverage.totalPossible
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Обробники подій Socket.IO для колаборації в реальному часі
io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
  
  // Додаткові обробники подій для сокетів
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open your browser and navigate to http://localhost:${PORT}`);
}); 